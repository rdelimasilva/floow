import { and, eq, like, notLike, or, isNull, sql } from 'drizzle-orm'
import { accounts, transactions } from '@floow/db'
import type { PolpCardBill } from '@floow/core-finance'
import type { Db } from './persist-page'
import { PREFIXO_DIFERENCA, faltasPorFatura, faturasFechadas } from './diferenca-da-fatura'

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function mesAno(fechamento: string): string {
  return `${fechamento.slice(5, 7)}/${fechamento.slice(0, 4)}`
}

/**
 * Grava, uma linha por fatura fechada, o que o banco cobrou e o Open Finance
 * não informou (`diferenca-da-fatura.ts`). Recalculada a cada sync: muda de
 * valor, ou sai, quando o que faltava chega. Linha que o usuário ignorou
 * continua ignorada, só com o valor atualizado.
 *
 * Fora do fluxo de caixa: é a soma de parcelas de compras feitas antes do
 * histórico, sem data nem categoria próprias; contar como despesa do mês
 * levaria R$ 17 mil para dezembro. `origem: 'ajuste'` a mantém fora da
 * conciliação, que só mexe em extrato, manual, arquivo e perna.
 */
export async function registrarDiferencaDaFatura(
  db: Db,
  orgId: string,
  accountId: string,
  faturasDoBanco: readonly PolpCardBill[],
  inicio: string,
): Promise<number> {
  const faturas = faturasFechadas(faturasDoBanco)
  if (faturas.length < 2) return 0

  const linhas = (await db
    .select({
      amountCents: transactions.amountCents,
      date: transactions.date,
      billId: transactions.billId,
      billForecastMonth: transactions.billForecastMonth,
    })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      eq(transactions.accountId, accountId),
      eq(transactions.isIgnored, false),
      // A parcela entra no saldo no vencimento, mas já está na fatura que
      // fechou: o lançamento do banco conta mesmo antes de entrar no saldo.
      or(eq(transactions.balanceApplied, true), and(eq(transactions.origem, 'extrato'), eq(transactions.aguardaExtrato, false))),
      or(isNull(transactions.externalId), notLike(transactions.externalId, `${PREFIXO_DIFERENCA}%`)),
    )))
    .map((l) => ({ ...l, date: iso(l.date) }))

  const faltas = faltasPorFatura(linhas, faturas, inicio)
  if (faltas.size === 0) return 0

  const existentes = await db
    .select({ id: transactions.id, externalId: transactions.externalId, amountCents: transactions.amountCents, isIgnored: transactions.isIgnored, balanceApplied: transactions.balanceApplied })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      eq(transactions.accountId, accountId),
      like(transactions.externalId, `${PREFIXO_DIFERENCA}%`),
    ))
  const porFechamento = new Map(existentes.map((e) => [e.externalId!.slice(PREFIXO_DIFERENCA.length), e]))
  const noSaldo = (e: { isIgnored: boolean; balanceApplied: boolean } | undefined, valor: number) =>
    e && (e.isIgnored || !e.balanceApplied) ? 0 : valor

  let mudou = 0
  await db.transaction(async (tx) => {
    let delta = 0
    for (const [fechamento, falta] of faltas) {
      const atual = porFechamento.get(fechamento)
      if (falta === 0) {
        if (!atual) continue
        await tx.delete(transactions).where(and(eq(transactions.id, atual.id), eq(transactions.orgId, orgId)))
        delta -= noSaldo(atual, atual.amountCents)
        mudou++
        continue
      }
      if (atual?.amountCents === falta) continue
      if (atual) {
        await tx.update(transactions).set({ amountCents: falta }).where(and(eq(transactions.id, atual.id), eq(transactions.orgId, orgId)))
        delta += noSaldo(atual, falta - atual.amountCents)
      } else {
        await tx.insert(transactions).values({
          orgId,
          accountId,
          type: 'expense',
          amountCents: falta,
          description: `Fatura ${mesAno(fechamento)}: parcelas de compras anteriores ao histórico do Open Finance`,
          date: new Date(`${fechamento}T12:00:00Z`),
          externalId: `${PREFIXO_DIFERENCA}${fechamento}`,
          balanceApplied: true,
          origem: 'ajuste',
          affectsCashFlow: false,
          reviewState: 'confirmed',
        })
        delta += falta
      }
      mudou++
    }
    if (delta !== 0) {
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${delta}` })
        .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
    }
  })
  return mudou
}
