import { and, eq, gte, inArray, isNull, lte, notExists, sql } from 'drizzle-orm'
import { forecastMatchProposals, transactions, type getDb } from '@floow/db'
import {
  chaveDoPar,
  conciliarExtratoComAguardando,
  JANELA_DE_ABSORCAO_DIAS,
  type LinhaParaConciliar,
  type ParConciliado,
} from '@floow/core-finance'
import { condicaoDePrevisaoSemPropostaAberta, condicaoDeRealizadoSemVinculo } from '@/lib/finance/forecast-match-db'
import { absorverNoBanco } from './absorver'

type Db = ReturnType<typeof getDb>

const DIA_EM_MS = 24 * 60 * 60 * 1000
const dia = (d: Date | string) => new Date(d).toISOString().slice(0, 10)

/**
 * O extrato que já é o realizado de uma proposta pendente (uma recorrência
 * proposta num sync anterior) não é absorvido: se fosse, aprovar a proposta
 * depois violaria `idx_transactions_matched_unique` e a action estouraria.
 * SQL cru com parênteses pelo mesmo motivo de
 * `condicaoDePrevisaoSemPropostaAberta`.
 */
export function condicaoSemPropostaPendenteComoRealizado() {
  return notExists(
    sql`(select 1 from ${forecastMatchProposals} where ${forecastMatchProposals.realizedTransactionId} = ${transactions.id} and ${forecastMatchProposals.status} = 'pending')`,
  )
}

/**
 * R1 — extrato × aguardando. Absorve o par único; propõe o ambíguo em
 * `forecast_match_proposals`, onde o usuário decide em "Confirmar
 * previsões" como hoje. Quem chama segura o lock da conta.
 */
export async function aplicarR1(
  db: Db,
  orgId: string,
  accountId: string,
): Promise<{ absorvidas: ParConciliado[]; propostas: number }> {
  const aguardando = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      counterpartyTaxId: transactions.counterpartyTaxId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        eq(transactions.aguardaExtrato, true),
        isNull(transactions.matchedTransactionId),
        eq(transactions.isIgnored, false),
        // Com proposta aberta, a decisão já está com o usuário — inclusive a
        // que `desconciliar` reabriu.
        condicaoDePrevisaoSemPropostaAberta(),
      ),
    )

  if (aguardando.length === 0) return { absorvidas: [], propostas: 0 }

  const tempos = aguardando.map((a) => new Date(a.date).getTime())
  const inicio = new Date(Math.min(...tempos) - JANELA_DE_ABSORCAO_DIAS * DIA_EM_MS)
  const fim = new Date(Math.max(...tempos) + JANELA_DE_ABSORCAO_DIAS * DIA_EM_MS)

  const extrato = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      counterpartyTaxId: transactions.counterpartyTaxId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        eq(transactions.origem, 'extrato'),
        eq(transactions.aguardaExtrato, false),
        eq(transactions.isIgnored, false),
        gte(transactions.date, inicio),
        lte(transactions.date, fim),
        condicaoDeRealizadoSemVinculo(),
        condicaoSemPropostaPendenteComoRealizado(),
      ),
    )

  if (extrato.length === 0) return { absorvidas: [], propostas: 0 }

  // O que o usuário já recusou não volta — nem depois de um `desconciliar`.
  const recusadas = await db
    .select({
      forecastTransactionId: forecastMatchProposals.forecastTransactionId,
      realizedTransactionId: forecastMatchProposals.realizedTransactionId,
    })
    .from(forecastMatchProposals)
    .where(
      and(
        eq(forecastMatchProposals.orgId, orgId),
        eq(forecastMatchProposals.status, 'refused'),
        inArray(forecastMatchProposals.forecastTransactionId, aguardando.map((a) => a.id)),
      ),
    )

  const paraRegra = (l: (typeof aguardando)[number]): LinhaParaConciliar => ({
    id: l.id,
    amountCents: l.amountCents,
    dateISO: dia(l.date),
    counterpartyTaxId: l.counterpartyTaxId,
  })

  const { absorver, propor } = conciliarExtratoComAguardando(
    extrato.map(paraRegra),
    aguardando.map(paraRegra),
    new Set(recusadas.map((r) => chaveDoPar(r.forecastTransactionId, r.realizedTransactionId))),
  )

  const absorvidas: ParConciliado[] = []
  for (const par of absorver) {
    if (await absorverNoBanco(db, orgId, par)) absorvidas.push(par)
  }

  let propostas = 0
  for (const par of propor) {
    // `onConflictDoNothing`: par já decidido (`uq_fmp_par`) ou ponta com
    // outra proposta pendente — não é erro, a próxima passada tenta de novo.
    const inserida = await db
      .insert(forecastMatchProposals)
      .values({ orgId, forecastTransactionId: par.aguardandoId, realizedTransactionId: par.extratoId, status: 'pending' })
      .onConflictDoNothing()
      .returning({ id: forecastMatchProposals.id })
    if (inserida.length > 0) propostas++
  }

  return { absorvidas, propostas }
}
