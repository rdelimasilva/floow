import { and, eq, lt, sql } from 'drizzle-orm'
import { accounts, transactions } from '@floow/db'
import { extrairApuracaoDoSaldo, extrairSaldoDisponivelCents, type PolpClient } from '@floow/core-finance'
import type { Db } from './persist-page'

/**
 * O saldo da conta antes do primeiro lançamento do extrato.
 *
 * O extrato do Open Finance começa num dia qualquer (o Itaú, em 09/09/2025),
 * e a conta já tinha dinheiro antes dele: R$ 269,52. Somando só o extrato, o
 * app nunca chega ao saldo do banco, e conta conectada não aceita ajuste à mão
 * (`account-actions.ts`) — o saldo anterior não tinha por onde entrar.
 *
 * Sai só do banco: o saldo que ele informa menos a soma do extrato que ele
 * mandou até a apuração desse saldo. Nada do que o app tem entra na conta,
 * então lançamento duplicado ou faltando continua aparecendo como diferença.
 *
 * Gravado uma vez, no dia anterior ao primeiro lançamento, e nunca refeito:
 * a janela do Open Finance anda, e o extrato do começo deixa de vir. Só em
 * conta cujo histórico começa no extrato — linha mais antiga que ele é saldo
 * de outra origem (OFX, lançamento manual) e já cobre esse período.
 */

export const ID_SALDO_DE_ABERTURA = 'saldo-de-abertura'

export interface ExtratoLido {
  /** Soma do extrato até o dia da apuração do saldo (inclusive). */
  somaAte: (dia: string) => number
  /** Primeiro dia do extrato, AAAA-MM-DD. */
  primeiroDia: string
  /** Algum item não foi lido: a soma estaria incompleta. */
  incompleto: boolean
}

function diaAnterior(d: string): string {
  const x = new Date(`${d}T00:00:00Z`)
  x.setUTCDate(x.getUTCDate() - 1)
  return x.toISOString().slice(0, 10)
}

function diaEmSaoPaulo(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** O saldo de abertura, em centavos. */
export function calcularSaldoDeAbertura(saldoDoBancoCents: number, somaDoExtratoCents: number): number {
  return saldoDoBancoCents - somaDoExtratoCents
}

export async function registrarSaldoDeAbertura(
  db: Db,
  client: PolpClient,
  args: { orgId: string; accountId: string; polpResourceId: string; extrato: ExtratoLido },
): Promise<number | null> {
  const { orgId, accountId, polpResourceId, extrato } = args
  if (extrato.incompleto) return null

  const [jaTem] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.accountId, accountId), eq(transactions.externalId, ID_SALDO_DE_ABERTURA)))
    .limit(1)
  if (jaTem) return null

  const [anterior] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      eq(transactions.accountId, accountId),
      eq(transactions.isIgnored, false),
      lt(transactions.date, new Date(`${extrato.primeiroDia}T00:00:00Z`)),
    ))
    .limit(1)
  if (anterior) return null

  const detalhe = await client.getResourceDetail('ACCOUNT', polpResourceId).catch(() => null)
  const saldo = extrairSaldoDisponivelCents(detalhe)
  const apuracao = extrairApuracaoDoSaldo(detalhe)
  if (saldo == null || !apuracao) return null

  const abertura = calcularSaldoDeAbertura(saldo, extrato.somaAte(diaEmSaoPaulo(apuracao)))
  if (abertura === 0) return 0

  await db.transaction(async (tx) => {
    await tx.insert(transactions).values({
      orgId,
      accountId,
      type: abertura > 0 ? 'income' : 'expense',
      amountCents: abertura,
      description: 'Saldo inicial (antes do extrato do Open Finance)',
      date: new Date(`${diaAnterior(extrato.primeiroDia)}T12:00:00Z`),
      externalId: ID_SALDO_DE_ABERTURA,
      balanceApplied: true,
      origem: 'ajuste',
      // Dinheiro que já estava na conta, não entrada do mês.
      affectsCashFlow: false,
      reviewState: 'confirmed',
    })
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${abertura}` })
      .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
  })
  return abertura
}
