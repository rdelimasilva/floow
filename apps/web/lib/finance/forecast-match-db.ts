import { and, eq, gte, isNotNull, isNull, lte, notExists, sql } from 'drizzle-orm'
import { getDb, transactions, forecastMatchProposals } from '@floow/db'
import { matchForecast, type ForecastCandidate } from '@floow/core-finance'

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
 * sem vínculo, de template, não ignorada.
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
        isNotNull(transactions.recurringTemplateId),
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
  // cumpriu previsão nenhuma.
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
        eq(transactions.isIgnored, false),
        gte(transactions.date, inicio),
        lte(transactions.date, fim),
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
