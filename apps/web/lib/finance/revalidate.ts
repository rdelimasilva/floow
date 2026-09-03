import {
  budgetSpendingTag,
  categoriesTag,
  futureTransactionsTag,
  patrimonyHistoryTag,
  recentTransactionsTag,
  snapshotsTag,
  transactionsTag,
  invalidateTag,
} from '@/lib/cache-tags'

/**
 * Invalidação de cache compartilhada pelas actions de finanças.
 *
 * Vive fora de actions.ts para que category-actions.ts use exatamente as mesmas
 * tags: uma action que invalida menos que a outra produz tela defasada só em
 * alguns caminhos, que é o tipo de bug que ninguém reproduz.
 */

export function revalidateTransactionData(orgId: string) {
  invalidateTag(transactionsTag(orgId))
  invalidateTag(recentTransactionsTag(orgId, 6))
  invalidateTag(recentTransactionsTag(orgId, 24))
  invalidateTag(futureTransactionsTag(orgId, 24))
  // As telas de orçamento agregam as mesmas transações. Sem isto,
  // /budgets/spending, /budgets/pacing e o dashboard servem números defasados
  // por até 300s após uma edição.
  invalidateTag(budgetSpendingTag(orgId))
}

export function revalidateCategoryData(orgId: string) {
  invalidateTag(categoriesTag(orgId))
}

export function revalidateSnapshotData(orgId: string) {
  invalidateTag(snapshotsTag(orgId))
  invalidateTag(patrimonyHistoryTag(orgId, 12))
}
