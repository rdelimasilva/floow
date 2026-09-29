import { eq, sql } from 'drizzle-orm'
import { getDb, accounts, transactions } from '@floow/db'
import { buildForecastTransferLegRow, isOpenFinanceLinkedAccount } from '@/lib/openfinance/transfer-leg'
import { aguardaNaData, diaDaLinha, extratoDaConta } from './conciliacao/aguarda-extrato'

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

  // Destino Open Finance, na data que o extrato de lá cobre: a perna aguarda.
  // Antes do início do extrato, nenhum extrato cobre: perna real no saldo.
  const extratoDestino = await extratoDaConta(tx, args.orgId, args.destAccountId)
  const destinoAguarda = aguardaNaData(extratoDestino, 'perna', diaDaLinha(args.date))

  // Com FITID, a perna que aguarda tem chave de dedupe (`:transfer-par`).
  // Cartão Open Finance não é conciliável (Ruling P12), mas fica como antes:
  // o pagamento chega pelo extrato do cartão, então a perna daqui é prevista,
  // fora do saldo, e R3 a casa com o extrato de lá. Perna real creditaria o
  // cartão duas vezes.
  const destinoPrevisto = args.externalId !== null && (
    destinoAguarda ||
    (!extratoDestino.conciliavel && (await isOpenFinanceLinkedAccount(tx, args.orgId, args.destAccountId)))
  )

  if (destinoPrevisto) {
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
    aguardaExtrato: destinoAguarda,
    balanceApplied: !destinoAguarda,
  })

  if (!destinoAguarda) {
    await tx.update(accounts)
      .set({ balanceCents: sql`balance_cents + ${absAmount}` })
      .where(eq(accounts.id, args.destAccountId))
  }

  return { inserida: true, destinoPrevisto: destinoAguarda ? args.destAccountId : null }
}
