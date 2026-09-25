import { eq, sql } from 'drizzle-orm'
import { getDb, accounts, transactions } from '@floow/db'
import { buildForecastTransferLegRow, isOpenFinanceLinkedAccount } from '@/lib/openfinance/transfer-leg'

type Db = ReturnType<typeof getDb>

/**
 * Uma transferência marcada no import de extrato: a perna da conta importada
 * e a da outra conta própria. Destino Open Finance recebe perna PREVISTA —
 * o dinheiro real de lá chega pelo extrato de lá, e a conciliação casa os
 * dois; criar perna real duplicaria o valor (spec de 24/09, §3.6).
 */
export async function inserirTransferenciaImportada(
  tx: Db,
  args: {
    orgId: string
    accountId: string
    destAccountId: string
    amountCents: number
    description: string
    date: Date
    externalId: string | null
    importedAt: Date
    categoryId: string | null
  },
): Promise<{ inserida: boolean; destinoPrevisto: string | null }> {
  const absAmount = Math.abs(args.amountCents)
  const transferGroupId = crypto.randomUUID()

  const origem = await tx.insert(transactions).values({
    orgId: args.orgId,
    accountId: args.accountId,
    type: 'transfer',
    amountCents: -absAmount,
    description: args.description,
    date: args.date,
    externalId: args.externalId,
    importedAt: args.importedAt,
    transferGroupId,
    categoryId: args.categoryId,
    isAutoCategorized: false,
  }).onConflictDoNothing().returning({ id: transactions.id })

  // FITID repetido (duas transferências idênticas no mesmo CSV, ou reimportação):
  // a perna não entrou, então nada de saldo nem de perna de destino órfã.
  if (origem.length === 0) return { inserida: false, destinoPrevisto: null }

  await tx.update(accounts)
    .set({ balanceCents: sql`balance_cents + ${-absAmount}` })
    .where(eq(accounts.id, args.accountId))

  // Sem FITID não há chave de dedupe para a perna prevista: segue o caminho
  // antigo, perna real.
  const destinoOpenFinance = args.externalId !== null && (await isOpenFinanceLinkedAccount(tx, args.orgId, args.destAccountId))

  if (destinoOpenFinance) {
    await tx.insert(transactions).values(
      buildForecastTransferLegRow(
        { orgId: args.orgId, amountCents: -absAmount, date: args.date, externalId: args.externalId!, balanceApplied: false },
        args.accountId,
        args.destAccountId,
        transferGroupId,
      ),
    ).onConflictDoNothing()
    return { inserida: true, destinoPrevisto: args.destAccountId }
  }

  await tx.insert(transactions).values({
    orgId: args.orgId,
    accountId: args.destAccountId,
    type: 'transfer',
    amountCents: absAmount,
    description: args.description,
    date: args.date,
    transferGroupId,
    categoryId: args.categoryId,
    isAutoCategorized: false,
  })

  await tx.update(accounts)
    .set({ balanceCents: sql`balance_cents + ${absAmount}` })
    .where(eq(accounts.id, args.destAccountId))

  return { inserida: true, destinoPrevisto: null }
}
