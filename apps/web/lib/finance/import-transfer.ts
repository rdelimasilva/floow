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
    contaImportadaAguarda: boolean
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
    origem: 'arquivo',
    // Conta importada Open Finance: a linha do arquivo aguarda o extrato.
    aguardaExtrato: args.contaImportadaAguarda,
    balanceApplied: !args.contaImportadaAguarda,
  }).onConflictDoNothing().returning({ id: transactions.id })

  // FITID repetido (duas transferências idênticas no mesmo CSV, ou reimportação):
  // a perna não entrou, então nada de saldo nem de perna de destino órfã.
  if (origem.length === 0) return { inserida: false, destinoPrevisto: null }

  if (!args.contaImportadaAguarda) {
    await tx.update(accounts)
      .set({ balanceCents: sql`balance_cents + ${-absAmount}` })
      .where(eq(accounts.id, args.accountId))
  }

  const destinoLinked = await isOpenFinanceLinkedAccount(tx, args.orgId, args.destAccountId)

  // Com FITID, a perna que aguarda tem chave de dedupe (`:transfer-par`).
  if (destinoLinked && args.externalId !== null) {
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

  // Destino manual: perna real no saldo. Destino Open Finance sem FITID: a
  // perna aguarda o extrato de lá, fora do saldo, e o motor a absorve.
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
    origem: 'perna',
    aguardaExtrato: destinoLinked,
    balanceApplied: !destinoLinked,
  })

  if (!destinoLinked) {
    await tx.update(accounts)
      .set({ balanceCents: sql`balance_cents + ${absAmount}` })
      .where(eq(accounts.id, args.destAccountId))
  }

  return { inserida: true, destinoPrevisto: destinoLinked ? args.destAccountId : null }
}
