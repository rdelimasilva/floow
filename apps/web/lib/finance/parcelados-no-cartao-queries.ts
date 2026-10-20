import { and, eq, gt, isNotNull, or } from 'drizzle-orm'
import { accounts, recurringTemplates, transactions } from '@floow/db'
import { agruparParceladosNoCartao, type ParceladoNoCartao } from '@floow/core-finance'
import { withUserDb } from '@/lib/db/rls'
import { hojeEmSaoPaulo } from '@/lib/openfinance/parcelas-previstas'

/**
 * Compras parceladas no cartão que ainda têm parcela a vencer, para a tela
 * de dívidas. Calculado das transações a cada leitura: não há o que
 * cadastrar nem o que sincronizar.
 *
 * Entra a parcela do Open Finance (tem `purchase_date`) e a compra parcelada
 * manual, que é recorrência com quantidade fixa. Recorrência sem fim
 * (supermercado do mês) também grava `installment_total`, mas não é dívida.
 */
export async function getParceladosNoCartao(orgId: string): Promise<ParceladoNoCartao[]> {
  const rows = await withUserDb((tx) =>
    tx
      .select({
        accountId: transactions.accountId,
        accountName: accounts.name,
        purchaseDate: transactions.purchaseDate,
        recurringTemplateId: transactions.recurringTemplateId,
        installmentNumber: transactions.installmentNumber,
        installmentTotal: transactions.installmentTotal,
        amountCents: transactions.amountCents,
        date: transactions.date,
        description: transactions.description,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .leftJoin(recurringTemplates, eq(recurringTemplates.id, transactions.recurringTemplateId))
      .where(
        and(
          eq(transactions.orgId, orgId),
          eq(accounts.type, 'credit_card'),
          eq(transactions.type, 'expense'),
          eq(transactions.reviewState, 'confirmed'),
          eq(transactions.isIgnored, false),
          gt(transactions.installmentTotal, 1),
          isNotNull(transactions.installmentNumber),
          or(isNotNull(transactions.purchaseDate), eq(recurringTemplates.endMode, 'count')),
        ),
      ),
  )

  return agruparParceladosNoCartao(
    rows.map((r) => ({
      accountId: r.accountId,
      accountName: r.accountName,
      compra: r.purchaseDate ? r.purchaseDate.toISOString().slice(0, 10) : (r.recurringTemplateId as string),
      installmentNumber: r.installmentNumber as number,
      installmentTotal: r.installmentTotal as number,
      amountCents: Math.abs(r.amountCents),
      date: r.date.toISOString().slice(0, 10),
      description: r.description,
    })),
    hojeEmSaoPaulo(),
  )
}
