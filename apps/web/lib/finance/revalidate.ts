import {
  accountsTag,
  budgetSpendingTag,
  categoriesTag,
  futureTransactionsTag,
  investmentsTag,
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

/**
 * O saldo da conta mudou.
 *
 * Existem duas copias locais desta funcao — em `actions.ts` e em
 * `recurring-cancel.ts` — anteriores a este modulo. Elas fazem o mesmo e
 * podem migrar para ca; codigo novo usa esta, para nao criar uma terceira.
 */
export function revalidateAccountData(orgId: string) {
  invalidateTag(accountsTag(orgId))
}

export function revalidateCategoryData(orgId: string) {
  invalidateTag(categoriesTag(orgId))
}

/**
 * O valor da carteira de investimentos mudou.
 *
 * Migrada de `actions.ts`. Os pontos que invalidam investimentos em
 * `lib/investments/actions.ts` têm cópia própria; aqui é usada pela
 * sincronização do Open Finance (`revalidateSincronizacao`).
 */
export function revalidateInvestmentData(orgId: string) {
  invalidateTag(investmentsTag(orgId))
}

export function revalidateSnapshotData(orgId: string) {
  invalidateTag(snapshotsTag(orgId))
  invalidateTag(patrimonyHistoryTag(orgId, 12))
}

/**
 * Uma sincronização do Open Finance terminou: lançamentos, saldos e posições
 * podem ter mudado de uma vez.
 *
 * O sync invalidava só contas, transações e investimentos — e o cron diário,
 * nada. Os resumos mensais (Dashboard, Fluxo de Caixa) e o gasto diário (Ritmo
 * de Gastos) têm tags próprias e ficavam cada um com a sua cópia até expirar:
 * a mesma despesa do mês aparecia com um valor em cada tela.
 */
export function revalidateSincronizacao(orgId: string) {
  revalidateAccountData(orgId)
  revalidateTransactionData(orgId)
  revalidateInvestmentData(orgId)
  revalidateSnapshotData(orgId)
}

