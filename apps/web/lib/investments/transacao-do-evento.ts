import { eq, sql } from 'drizzle-orm'
import { accounts, portfolioEvents, transactions, type getDb, type NewTransaction } from '@floow/db'

type Db = ReturnType<typeof getDb>

// ---------------------------------------------------------------------------
// Cash flow mapping for INV-07 integration
// buy: expense (cash leaves account), sell: income (cash enters account),
// dividend/interest/amortization: income (cash enters account), split: no cash flow
// ---------------------------------------------------------------------------

export const CASH_FLOW_EVENT_TYPES: Record<string, { transactionType: 'income' | 'expense'; sign: 1 | -1 } | null> = {
  buy: { transactionType: 'expense', sign: -1 },
  sell: { transactionType: 'income', sign: 1 },
  dividend: { transactionType: 'income', sign: 1 },
  interest: { transactionType: 'income', sign: 1 },
  amortization: { transactionType: 'income', sign: 1 },
  split: null,
}

/**
 * O lançamento de caixa de um evento de carteira: grava a transação, move o
 * saldo da conta e liga o evento a ela. Saiu de `actions.ts`, que passava de
 * 500 linhas, e os dois caminhos (criar e editar evento) repetiam o bloco.
 */
export async function inserirTransacaoDoEvento(
  tx: Db,
  args: {
    orgId: string
    accountId: string
    eventId: string
    eventType: string
    eventDate: NewTransaction['date']
    totalCents: number
    assetTicker: string
  },
): Promise<void> {
  const mapeamento = CASH_FLOW_EVENT_TYPES[args.eventType]
  if (!mapeamento) return

  const signedAmount = mapeamento.sign * Math.abs(args.totalCents)

  const [txRow] = await tx
    .insert(transactions)
    .values({
      orgId: args.orgId,
      accountId: args.accountId,
      type: mapeamento.transactionType,
      amountCents: signedAmount,
      description: `${args.eventType}: ${args.assetTicker}`,
      date: args.eventDate,
      origem: 'investimento',
    })
    .returning()

  await tx
    .update(accounts)
    .set({ balanceCents: sql`balance_cents + ${signedAmount}` })
    .where(eq(accounts.id, args.accountId))

  await tx
    .update(portfolioEvents)
    .set({ transactionId: txRow.id })
    .where(eq(portfolioEvents.id, args.eventId))
}
