import { and, eq, gte, isNotNull, isNull, lte, notExists, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { getDb, transactions, forecastMatchProposals } from '@floow/db'
import { matchForecast, type ForecastCandidate } from '@floow/core-finance'
import { condicaoDePernaPrevista, condicaoNaoEPernaPrevista, SUFIXO_PERNA_PREVISTA } from '@/lib/openfinance/perna-prevista'

type Db = ReturnType<typeof getDb>

/**
 * Quantos dias em volta do previsto vale procurar realizado. Maior que a
 * janela de `matchForecast` de propósito: a query traz o candidato e a função
 * pura decide. Filtrar apertado aqui esconderia caso da lógica testada.
 */
const JANELA_BUSCA_DIAS = 10

const DIA_EM_MS = 24 * 60 * 60 * 1000

/**
 * Verdadeiro quando a previsão (a linha de `transactions` sendo filtrada) NÃO
 * tem proposta pendente aberta em `forecast_match_proposals`.
 *
 * SQL cru, e não `notExists(db.select(...))`: para montar
 * `.where(and(...))`, o JS avalia os argumentos antes de chamar `.where()` —
 * um `notExists(db.select()...)` aqui dispararia uma SEGUNDA chamada a
 * `db.select()` já na construção da consulta de `previstos`, antes até dela
 * rodar, o que quebra o mock de banco dos testes (cada `db.select()` consome
 * uma fixture da fila).
 *
 * Os parênteses em volta do `select` são obrigatórios — `NOT EXISTS` exige
 * uma subconsulta parenteizada, e `notExists()` do drizzle só os adiciona
 * sozinho quando recebe um query builder, não um fragmento `sql` cru. Sem
 * eles o Postgres recusa a consulta inteira, e nenhum teste com `db` mockado
 * pega isso — só a renderização real do SQL pega, por isso a função é
 * exportada e testada em `previsao-sem-proposta-aberta-sql.test.ts`.
 */
export function condicaoDePrevisaoSemPropostaAberta() {
  return notExists(
    sql`(select 1 from ${forecastMatchProposals} where ${forecastMatchProposals.forecastTransactionId} = ${transactions.id} and ${forecastMatchProposals.status} = 'pending')`,
  )
}

/**
 * Verdadeiro quando a linha de `transactions` sendo filtrada NÃO é o
 * realizado de uma proposta pendente contra perna prevista de transferência.
 *
 * Essa ponta já tem decisão esperando em Confirmar previsões. Se Classificar
 * também a mostrasse, o usuário poderia marcá-la como transferência de novo —
 * criando uma perna prevista na conta de origem, que casaria com a linha real
 * de lá: dois pares cruzados para o mesmo dinheiro.
 *
 * Aliases `fmp`/`prev` porque a subconsulta relê `transactions`; sem alias,
 * `"transactions"."id"` apontaria para a linha de dentro.
 */
export function condicaoForaDeParDeTransferenciaPendente() {
  return sql`not exists (select 1 from ${forecastMatchProposals} fmp inner join ${transactions} prev on prev.id = fmp.forecast_transaction_id where fmp.realized_transaction_id = ${transactions.id} and fmp.status = 'pending' and prev.external_id like ${`%${SUFIXO_PERNA_PREVISTA}`})`
}

/**
 * A proposta, dentro da org, ainda pendente. O filtro das duas actions da fila
 * (`aprovarProposta` e `recusarProposta`).
 *
 * Função exportada por causa do escopo de org: as actions rodam sob `getDb()`,
 * que conecta como dono das tabelas e IGNORA as policies de RLS, então este
 * `org_id` é a única barreira entre organizações — um id de proposta alheio
 * efetivaria conciliação de outra org. O mock de query-builder dos testes de
 * action descarta os argumentos de `.where()` e passaria igual sem o filtro;
 * `escopo-de-org-nas-actions.test.ts` renderiza a condição e trava o `org_id`.
 *
 * Mora aqui, e não em `forecast-match-actions.ts`, porque aquele arquivo é
 * `'use server'` e só pode exportar função async.
 */
export function condicaoDePropostaPendenteDaOrg(propostaId: string, orgId: string) {
  return and(
    eq(forecastMatchProposals.id, propostaId),
    eq(forecastMatchProposals.orgId, orgId),
    eq(forecastMatchProposals.status, 'pending'),
  )
}

/** A transação, dentro da org. Mesmo motivo da função acima. */
export function condicaoDaTransacaoDaOrg(transacaoId: string, orgId: string) {
  return and(eq(transactions.id, transacaoId), eq(transactions.orgId, orgId))
}

/**
 * A subconsulta de "quem já reivindicou este realizado" lê a MESMA tabela da
 * consulta externa, e por isso precisa de alias próprio: sem ele,
 * `transactions.id` dentro dela apontaria para a linha de dentro e o
 * `NOT EXISTS` nunca seria verdadeiro.
 */
const jaVinculado = alias(transactions, 'ja_vinculado')

/**
 * Verdadeiro quando NENHUMA transação aponta para este realizado (a linha de
 * `transactions` sendo filtrada) em `matched_transaction_id`.
 *
 * Sem este filtro, o realizado que já cumpriu uma previsão continua na lista
 * de candidatos. Os índices da 00047 não fecham o caso:
 * `uq_fmp_realizado_pendente` é parcial em `status = 'pending'`, então quando
 * a proposta é aprovada a linha sai do índice e um segundo previsto pode ser
 * proposto para o mesmo realizado. Templates "Aluguel" R$ 1.200 dia 01 e
 * "Condomínio" R$ 1.200 dia 05, um débito de R$ 1.200 no dia 03: aprovada a
 * proposta (Aluguel, R), o sync seguinte propõe (Condomínio, R) — e na fila
 * "É o mesmo" viola `idx_transactions_matched_unique` da 00042, a action
 * estoura, e a proposta fica presa na fila e no contador do badge para sempre.
 *
 * O `Set` de `reivindicados` não cobre isso: ele só protege dentro de uma
 * rodada de sync, e só do lado da previsão.
 *
 * SQL cru e parênteses escritos à mão, pelos mesmos dois motivos de
 * `condicaoDePrevisaoSemPropostaAberta` acima. Testada em
 * `realizado-ja-reivindicado-sql.test.ts`.
 */
export function condicaoDeRealizadoSemVinculo() {
  return notExists(
    sql`(select 1 from ${transactions} ${jaVinculado} where ${jaVinculado.matchedTransactionId} = ${transactions.id})`,
  )
}

/**
 * Propõe, nesta conta, o par previsto×realizado que o casamento encontrar.
 *
 * Antes esta função GRAVAVA o vínculo (`matched_transaction_id`) e a previsão
 * era declarada cumprida sem ninguém olhar. Casar errado esconde um lançamento
 * de verdade: a previsão sai da fila e o realizado fica sozinho no saldo, sem
 * nada apontando que o par era mentira. Agora ela só propõe — quem efetiva é
 * `aprovarProposta`.
 *
 * `onConflictDoNothing` cobre os dois casos que não são erro: o par já foi
 * recusado (barrado pelo único em (previsão, realizado)) ou a previsão já tem
 * proposta aberta. Sem ele, a segunda rodada de sync estouraria.
 *
 * O filtro de previsão aberta é o mesmo de antes — `balance_applied = false`,
 * sem vínculo, de template ou perna prevista de transferência, não ignorada.
 */
export async function criarPropostasDeConciliacao(
  db: Db,
  orgId: string,
  accountId: string,
): Promise<number> {
  const previstos = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      description: transactions.description,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        // Previsão é de template (recorrente) ou perna de transferência cujo
        // destino é conta Open Finance — a outra ponta chega pelo extrato.
        or(isNotNull(transactions.recurringTemplateId), condicaoDePernaPrevista()),
        eq(transactions.balanceApplied, false),
        isNull(transactions.matchedTransactionId),
        eq(transactions.isIgnored, false),
        // Previsão com proposta aberta não é proposta de novo. O índice único
        // parcial barraria, mas gastar uma tentativa de insert por rodada de
        // sync para descobrir isso é desperdício.
        condicaoDePrevisaoSemPropostaAberta(),
      ),
    )

  if (previstos.length === 0) return 0

  const datas = previstos.map((p) => new Date(p.date).getTime())
  const inicio = new Date(Math.min(...datas) - JANELA_BUSCA_DIAS * DIA_EM_MS)
  const fim = new Date(Math.max(...datas) + JANELA_BUSCA_DIAS * DIA_EM_MS)

  // Realizado é o que veio do banco: tem `external_id` e não nasceu de
  // template. `isIgnored` fora porque lançamento marcado como errado não
  // cumpriu previsão nenhuma, e realizado já reivindicado por outra previsão
  // também fora — propor de novo geraria proposta impossível de aprovar.
  const realizados = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      description: transactions.description,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        isNotNull(transactions.externalId),
        isNull(transactions.recurringTemplateId),
        // A perna prevista também tem `external_id` (para dedupe), mas é
        // previsão: jamais pode cumprir outra previsão.
        condicaoNaoEPernaPrevista(),
        // Linha com grupo já é ponta de um par (origem de transferência, ou a
        // perna real de destino manual). Em OF↔OF com as duas contrapartes
        // confirmadas, casar a origem de um lado com a perna prevista do outro
        // daria dois pares para o mesmo dinheiro.
        isNull(transactions.transferGroupId),
        eq(transactions.isIgnored, false),
        gte(transactions.date, inicio),
        lte(transactions.date, fim),
        condicaoDeRealizadoSemVinculo(),
      ),
    )

  if (realizados.length === 0) return 0

  const abertos: ForecastCandidate[] = previstos.map((p) => ({
    id: p.id,
    amountCents: p.amountCents,
    date: new Date(p.date),
    description: p.description,
  }))

  const reivindicados = new Set<string>()
  let criadas = 0

  for (const realizado of realizados) {
    const disponiveis = abertos.filter((p) => !reivindicados.has(p.id))
    if (disponiveis.length === 0) break

    const casado = matchForecast(
      {
        amountCents: realizado.amountCents,
        date: new Date(realizado.date),
        description: realizado.description,
      },
      disponiveis,
    )

    if (!casado) continue

    reivindicados.add(casado.id)

    const inserida = await db
      .insert(forecastMatchProposals)
      .values({
        orgId,
        forecastTransactionId: casado.id,
        realizedTransactionId: realizado.id,
        status: 'pending',
      })
      .onConflictDoNothing()
      .returning({ id: forecastMatchProposals.id })

    if (inserida.length > 0) criadas++
  }

  return criadas
}
