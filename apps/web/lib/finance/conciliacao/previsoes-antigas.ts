import { and, eq, gte, inArray, isNotNull, lt, lte } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { transactions, type RlsTx } from '@floow/db'
import { condicaoDeRealizadoSemVinculo, JANELA_BUSCA_DIAS } from '@/lib/finance/forecast-match-db'
import { JANELA_PREVISAO_ANTIGA_DIAS } from './candidatos'

const DIA_EM_MS = 24 * 60 * 60 * 1000
/** Mesmo mês cobre até 30 dias para qualquer lado. */
const FOLGA_DIAS = Math.max(JANELA_PREVISAO_ANTIGA_DIAS, 31)

/**
 * Previsão de recorrência vencida há mais de `JANELA_BUSCA_DIAS` sem vínculo
 * (#13): a janela do sync já passou e ela nunca seria proposta. Entra na fila
 * pela busca ampliada de `escolherCandidatas`.
 */
export function ehPrevisaoAntiga(p: { recurringTemplateId: string | null; date: string }, hoje: Date): boolean {
  return p.recurringTemplateId !== null && Date.parse(p.date.slice(0, 10)) < hoje.getTime() - JANELA_BUSCA_DIAS * DIA_EM_MS
}

/**
 * Lançamentos do banco anteriores à janela da fila (`antesDe`) que podem
 * cumprir uma previsão antiga: mesmas contas, em volta das datas delas.
 * Mesmo filtro dos recentes de `lerFila`.
 */
export async function lerLancamentosParaAntigas(
  db: RlsTx,
  orgId: string,
  antigas: { accountId: string; date: string }[],
  antesDe: Date,
) {
  if (antigas.length === 0) return []
  const datas = antigas.map((a) => Date.parse(a.date.slice(0, 10)))
  const inicio = new Date(Math.min(...datas) - FOLGA_DIAS * DIA_EM_MS)
  if (inicio >= antesDe) return []
  const fim = new Date(Math.max(...datas) + FOLGA_DIAS * DIA_EM_MS)
  return db
    .select({
      id: transactions.id, accountId: transactions.accountId, date: transactions.date, amountCents: transactions.amountCents,
      description: transactions.description, counterpartyId: transactions.counterpartyId, categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId), eq(transactions.origem, 'extrato'), eq(transactions.isIgnored, false),
      inArray(transactions.accountId, [...new Set(antigas.map((a) => a.accountId))]),
      gte(transactions.date, inicio), lte(transactions.date, fim), lt(transactions.date, antesDe),
      condicaoDeRealizadoSemVinculo(),
    ))
}
