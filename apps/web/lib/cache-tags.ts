import { revalidateTag } from 'next/cache'

/**
 * Expira a tag na hora.
 *
 * Com um perfil de cacheLife ('default', 'max') o Next 16 faz
 * stale-while-revalidate: a leitura seguinte ainda devolve o dado velho, e a
 * resposta da Server Action não traz o RSC novo — a tela não via a própria
 * edição sem um `router.refresh()`, que é um segundo render inteiro da rota.
 * `expire: 0` vale também fora de Server Action (route handler, cron), onde
 * `updateTag` lançaria.
 */
export function invalidateTag(tag: string) {
  revalidateTag(tag, { expire: 0 })
}

/** Estado do portão de revisão do Open Finance (`orgs.review_gate_cleared_at`). */
export function reviewGateTag(orgId: string) {
  return `review-gate:${orgId}`
}

export function accountsTag(orgId: string) {
  return `accounts:${orgId}`
}

export function categoriesTag(orgId: string) {
  return `categories:${orgId}`
}

export function transactionsTag(orgId: string) {
  return `transactions:${orgId}`
}

export function recentTransactionsTag(orgId: string, months: number) {
  return `transactions:${orgId}:recent:${months}`
}

export function futureTransactionsTag(orgId: string, months: number) {
  return `transactions:${orgId}:future:${months}`
}

export function snapshotsTag(orgId: string) {
  return `snapshots:${orgId}`
}

export function investmentsTag(orgId: string) {
  return `investments:${orgId}`
}

export function pricesTag(orgId: string) {
  return `asset-prices:${orgId}`
}

export function priceHistoryTag(orgId: string, assetId: string) {
  return `asset-prices:${orgId}:${assetId}`
}

export function incomeEventsTag(orgId: string, months: number) {
  return `investment-income:${orgId}:${months}`
}

export function patrimonyHistoryTag(orgId: string, months: number) {
  return `patrimony-history:${orgId}:${months}`
}

export function fixedAssetsTag(orgId: string) {
  return `fixed-assets:${orgId}`
}

export function fixedAssetTypesTag(orgId: string) {
  return `fixed-asset-types:${orgId}`
}

export function budgetGoalsTag(orgId: string, type: 'spending' | 'investing') {
  return `budget-goals:${orgId}:${type}`
}

export function budgetEntriesTag(orgId: string, type: 'spending' | 'investing') {
  return `budget-entries:${orgId}:${type}`
}

export function budgetSpendingTag(orgId: string) {
  return `budget-spending:${orgId}`
}

export function budgetInvestingTag(orgId: string) {
  return `budget-investing:${orgId}`
}

export function planningTag(orgId: string) {
  return `planning:${orgId}`
}

export function planningSummaryTag(orgId: string) {
  return `planning-summary:${orgId}`
}

export function cfoInsightsTag(orgId: string) {
  return `cfo-insights:${orgId}`
}

export function cfoRunsTag(orgId: string) {
  return `cfo-runs:${orgId}`
}
