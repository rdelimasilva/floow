'use server'
import { getDb, accounts, transactions } from '@floow/db'
import { updateTransactionSchema } from '@floow/shared'

import { eq, sql, and, inArray } from 'drizzle-orm'
import { getOrgId } from './queries'
import { assertAccountOwnership } from './account-actions'
import { deveAplicarSaldoNaEdicao } from './saldo-na-edicao'
import {
  revalidateAccountData,
  revalidateSnapshotData,
  revalidateTransactionData,
} from './revalidate'

type Db = ReturnType<typeof getDb>

/**
 * Server action: delete a transaction and reverse its balance impact.
 * For transfers, deletes both legs and reverses both balance changes.
 * Wrapped in a db.transaction for atomicity.
 */
export async function deleteTransaction(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const transactionId = formData.get('id') as string
  if (!transactionId) throw new Error('Transaction ID is required')

  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))
    .limit(1)

  if (!tx) throw new Error('Transaction not found')

  await db.transaction(async (dbTx) => {
    if (tx.transferGroupId) {
      const legs = await dbTx
        .select()
        .from(transactions)
        .where(and(eq(transactions.transferGroupId, tx.transferGroupId), eq(transactions.orgId, orgId)))

      for (const leg of legs) {
        // Only reverse balance if it was already applied
        if (leg.balanceApplied) {
          await dbTx
            .update(accounts)
            .set({ balanceCents: sql`balance_cents + ${-leg.amountCents}` })
            .where(eq(accounts.id, leg.accountId))
        }
      }

      await dbTx
        .delete(transactions)
        .where(and(eq(transactions.transferGroupId, tx.transferGroupId), eq(transactions.orgId, orgId)))
    } else {
      // Only reverse balance if it was already applied
      if (tx.balanceApplied) {
        await dbTx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${-tx.amountCents}` })
          .where(eq(accounts.id, tx.accountId))
      }

      await dbTx
        .delete(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))
    }
  })

  revalidateTransactionData(orgId)
  revalidateAccountData(orgId)
  revalidateSnapshotData(orgId)
}

/**
 * Server action: toggle the is_ignored flag on an imported transaction.
 * When ignoring: reverses the balance impact (as if the transaction didn't exist).
 * When un-ignoring: re-applies the balance impact.
 * Linha com balance_applied = false só troca a marca, sem mexer no saldo.
 * Only works on imported transactions (externalId IS NOT NULL).
 */
export async function toggleIgnoreTransaction(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const transactionId = formData.get('id') as string
  if (!transactionId) throw new Error('Transaction ID is required')

  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))
    .limit(1)

  if (!tx) throw new Error('Transação não encontrada')
  if (!tx.externalId) throw new Error('Apenas transações importadas podem ser ignoradas')

  const newIgnored = !tx.isIgnored
  // If ignoring: reverse balance. If un-ignoring: re-apply balance.
  const balanceDelta = newIgnored ? -tx.amountCents : tx.amountCents

  await db.transaction(async (dbTx) => {
    await dbTx
      .update(transactions)
      .set({ isIgnored: newIgnored })
      .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))

    // Linha fora do saldo (parcela futura, agendado) só troca a marca: o valor
    // nunca entrou, e `applyDueBankTransactions` a aplica quando vencer.
    if (tx.balanceApplied) {
      await dbTx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${balanceDelta}` })
        .where(eq(accounts.id, tx.accountId))
    }
  })

  revalidateTransactionData(orgId)
  revalidateAccountData(orgId)
  revalidateSnapshotData(orgId)
}

/**
 * Server action: update an existing transaction's fields and adjust account balances.
 * Reverses the old balance impact, applies the new one, and updates the row.
 * Transfer transactions cannot be edited — they must be deleted and recreated.
 */
export async function updateTransaction(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const input = updateTransactionSchema.parse({
    id: formData.get('id'),
    accountId: formData.get('accountId'),
    categoryId: formData.get('categoryId') || undefined,
    type: formData.get('type'),
    amountCents: parseInt(formData.get('amountCents') as string, 10),
    description: formData.get('description'),
    date: formData.get('date'),
    destAccountId: formData.get('destAccountId') || undefined,
  })

  const [oldTx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, input.id), eq(transactions.orgId, orgId)))
    .limit(1)

  if (!oldTx) throw new Error('Transaction not found')
  if (oldTx.transferGroupId) throw new Error('Cannot edit transfer transactions. Delete and recreate instead.')

  const newSignedAmount = input.type === 'income' ? input.amountCents : -input.amountCents

  // Converter em transferência exige a outra conta. Antes desta checagem o
  // `type` virava 'transfer' com valor negativo e sem `transferGroupId`: o
  // saldo caía e não existia contrapartida nenhuma. A perna órfã nem aparecia
  // nos relatórios, porque transferência é neutra no fluxo de caixa.
  const convertendoEmTransferencia = input.type === 'transfer'

  if (convertendoEmTransferencia) {
    if (!input.destAccountId) {
      throw new Error('Transferência exige a conta de destino.')
    }
    if (input.destAccountId === input.accountId) {
      throw new Error('A conta de destino não pode ser a mesma conta do lançamento.')
    }
  }

  const transferGroupId = convertendoEmTransferencia ? crypto.randomUUID() : null

  await db.transaction(async (tx) => {
    await assertAccountOwnership(tx as unknown as Db, input.accountId, orgId)
    if (convertendoEmTransferencia) {
      // Mesma cerca do createTransaction: sem ela um destino de outra org
      // receberia crédito de saldo cross-tenant.
      await assertAccountOwnership(tx as unknown as Db, input.destAccountId!, orgId)
    }

    // Reverse old balance impact only if it was applied
    if (oldTx.balanceApplied) {
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${-oldTx.amountCents}` })
        .where(eq(accounts.id, oldTx.accountId))
    }

    // Previsão (template ou parcela) e parcela futura do banco só entram quando
    // a regra de `deveAplicarSaldoNaEdicao` deixa; o resto entra sempre.
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const balanceAppliedValue = deveAplicarSaldoNaEdicao(oldTx, input.date.toISOString().slice(0, 10), hoje)

    if (balanceAppliedValue) {
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${newSignedAmount}` })
        .where(eq(accounts.id, input.accountId))
    }

    // Update the transaction row
    await tx
      .update(transactions)
      .set({
        accountId: input.accountId,
        // Transferência não tem categoria — o próprio schema da fila de
        // contrapartes já trata as duas coisas como mutuamente exclusivas.
        categoryId: convertendoEmTransferencia ? null : (input.categoryId ?? null),
        type: input.type,
        amountCents: newSignedAmount,
        description: input.description,
        date: new Date(input.date),
        balanceApplied: balanceAppliedValue,
        transferGroupId,
      })
      .where(and(eq(transactions.id, input.id), eq(transactions.orgId, orgId)))

    if (convertendoEmTransferencia) {
      // Segunda perna: valor invertido na conta de destino, mesmo grupo.
      // `balanceApplied` acompanha a origem para uma origem futura não
      // creditar o destino antes da hora — mesmo racional de
      // `buildTransferLegRow` no caminho do Open Finance.
      await tx.insert(transactions).values({
        orgId,
        accountId: input.destAccountId!,
        categoryId: null,
        type: 'transfer',
        amountCents: input.amountCents,
        description: input.description,
        date: new Date(input.date),
        transferGroupId,
        balanceApplied: balanceAppliedValue,
      })

      if (balanceAppliedValue) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${input.amountCents}` })
          .where(eq(accounts.id, input.destAccountId!))
      }
    }
  })

  revalidateTransactionData(orgId)
  revalidateAccountData(orgId)
  revalidateSnapshotData(orgId)
}

// `cancelRecurring` mudou de casa: vive em `./recurring-cancel`, de onde quem
// usa importa direto — reexportar daqui nao da, porque arquivo "use server" so
// exporta funcao async declarada nele. O antigo `actions.ts` tinha 1250 linhas
// com o limite do projeto em 500, e a funcao ganhou a opcao de limpar as
// parcelas vencidas: codigo novo entra em modulo focado, nao no deposito.
//
// `applyDueBankTransactions` vive em `./apply-due`. Aqui ficava
// `reconcileRecurringBalances`, que aplicava no saldo QUALQUER linha pendente
// cuja data tivesse chegado — previsao de template inclusive. Ver o modulo
// para o porque de a versao que sobrou so olhar lancamento do banco.

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

/**
 * Bulk delete transactions by IDs. Reverses balance for each and handles transfers.
 */
export async function bulkDeleteTransactions(ids: string[]) {
  if (ids.length === 0) return

  const orgId = await getOrgId()
  const db = getDb()

  const txRows = await db
    .select()
    .from(transactions)
    .where(and(inArray(transactions.id, ids), eq(transactions.orgId, orgId)))

  if (txRows.length === 0) return

  // Collect all transfer group IDs to delete both legs
  const transferGroupIds = new Set(txRows.filter((t) => t.transferGroupId).map((t) => t.transferGroupId!))
  const standaloneIds = txRows.filter((t) => !t.transferGroupId).map((t) => t.id)

  await db.transaction(async (dbTx) => {
    // Handle transfers (both legs)
    for (const groupId of transferGroupIds) {
      const legs = await dbTx.select().from(transactions)
        .where(and(eq(transactions.transferGroupId, groupId), eq(transactions.orgId, orgId)))

      for (const leg of legs) {
        if (leg.balanceApplied) {
          await dbTx.update(accounts)
            .set({ balanceCents: sql`balance_cents + ${-leg.amountCents}` })
            .where(eq(accounts.id, leg.accountId))
        }
      }

      await dbTx.delete(transactions)
        .where(and(eq(transactions.transferGroupId, groupId), eq(transactions.orgId, orgId)))
    }

    // Handle standalone transactions
    if (standaloneIds.length > 0) {
      const standalone = txRows.filter((t) => !t.transferGroupId && t.balanceApplied)
      // Reverse balances grouped by account
      const deltaByAccount = new Map<string, number>()
      for (const t of standalone) {
        deltaByAccount.set(t.accountId, (deltaByAccount.get(t.accountId) ?? 0) - t.amountCents)
      }
      for (const [accountId, delta] of deltaByAccount) {
        if (delta !== 0) {
          await dbTx.update(accounts)
            .set({ balanceCents: sql`balance_cents + ${delta}` })
            .where(eq(accounts.id, accountId))
        }
      }

      await dbTx.delete(transactions)
        .where(and(inArray(transactions.id, standaloneIds), eq(transactions.orgId, orgId)))
    }
  })

  revalidateTransactionData(orgId)
  revalidateAccountData(orgId)
  revalidateSnapshotData(orgId)
}

/**
 * Bulk update category for transactions by IDs.
 */
export async function bulkCategorizeTransactions(ids: string[], categoryId: string | null) {
  if (ids.length === 0) return

  const orgId = await getOrgId()
  const db = getDb()

  await db
    .update(transactions)
    .set({ categoryId, isAutoCategorized: false })
    .where(and(inArray(transactions.id, ids), eq(transactions.orgId, orgId)))

  revalidateTransactionData(orgId)
}
