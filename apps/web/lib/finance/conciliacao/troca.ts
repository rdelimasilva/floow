import { and, eq, isNotNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { forecastMatchProposals, transactions, type getDb } from '@floow/db'
import { matchForecast, type ForecastCandidate } from '@floow/core-finance'
import {
  condicaoDePrevisaoSemPropostaAberta,
  condicaoDeRealizadoLivre,
  JANELA_BUSCA_DIAS,
} from '@/lib/finance/forecast-match-db'
import { condicaoSemPropostaPendenteComoRealizado } from './r1-candidatos'

type Db = ReturnType<typeof getDb>

const DIA_EM_MS = 24 * 60 * 60 * 1000

/** O lançamento ao qual a previsão está vinculada hoje. */
const atual = alias(transactions, 'vinculo_atual')

/**
 * Vínculo errado bloqueia o certo em silêncio. Caso de 01/10/2026: Jussara
 * 10/61 (R$ 3.600) presa à Unimed (R$ 3.314,17), e a TED dela de 01/10 sem
 * previsão para casar — `criarPropostasDeConciliacao` só olha previsão
 * aberta.
 *
 * Aqui: a previsão de recorrência desta conta cujo vínculo a regra de hoje
 * (`matchForecast`) NÃO faria, e um lançamento livre do banco que ela faz,
 * viram proposta de TROCA (`substitui_transaction_id`). O usuário decide na
 * fila; aprovar solta o vínculo antigo (ver `aprovarProposta`). Vínculo que a
 * regra faria fica como está, e troca recusada não volta (`uq_fmp_par`).
 *
 * Linha que aguarda o extrato fica de fora: a absorção dela deu efeito ao
 * extrato, que só `desconciliar` desfaz.
 */
export async function criarPropostasDeTroca(db: Db, orgId: string, accountId: string): Promise<number> {
  const presas = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      description: transactions.description,
      atualId: atual.id,
      atualAmountCents: atual.amountCents,
      atualDate: atual.date,
      atualDescription: atual.description,
    })
    .from(transactions)
    .innerJoin(atual, eq(atual.id, transactions.matchedTransactionId))
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        isNotNull(transactions.recurringTemplateId),
        eq(transactions.aguardaExtrato, false),
        eq(transactions.isIgnored, false),
        condicaoDePrevisaoSemPropostaAberta(),
      ),
    )

  const trocaveis = presas.filter(
    (p) =>
      !matchForecast(
        { amountCents: p.atualAmountCents, date: new Date(p.atualDate), description: p.atualDescription },
        [{ id: p.id, amountCents: p.amountCents, date: new Date(p.date), description: p.description }],
      ),
  )
  if (trocaveis.length === 0) return 0

  const datas = trocaveis.map((p) => new Date(p.date).getTime())
  const inicio = new Date(Math.min(...datas) - JANELA_BUSCA_DIAS * DIA_EM_MS)
  const fim = new Date(Math.max(...datas) + JANELA_BUSCA_DIAS * DIA_EM_MS)

  // Realizado com proposta pendente já tem decisão esperando na fila.
  const livres = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      description: transactions.description,
    })
    .from(transactions)
    .where(and(condicaoDeRealizadoLivre(orgId, accountId, inicio, fim), condicaoSemPropostaPendenteComoRealizado()))

  const candidatas: (ForecastCandidate & { atualId: string })[] = trocaveis.map((p) => ({
    id: p.id,
    amountCents: p.amountCents,
    date: new Date(p.date),
    description: p.description,
    atualId: p.atualId,
  }))
  const reivindicadas = new Set<string>()
  let criadas = 0

  for (const realizado of livres) {
    const disponiveis = candidatas.filter((c) => !reivindicadas.has(c.id))
    if (disponiveis.length === 0) break
    const casada = matchForecast(
      { amountCents: realizado.amountCents, date: new Date(realizado.date), description: realizado.description },
      disponiveis,
    ) as (typeof candidatas)[number] | null
    if (!casada) continue
    reivindicadas.add(casada.id)

    const inserida = await db
      .insert(forecastMatchProposals)
      .values({
        orgId,
        forecastTransactionId: casada.id,
        realizedTransactionId: realizado.id,
        status: 'pending',
        substituiTransactionId: casada.atualId,
      })
      .onConflictDoNothing()
      .returning({ id: forecastMatchProposals.id })
    if (inserida.length > 0) criadas++
  }

  return criadas
}
