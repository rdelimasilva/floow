/**
 * Sugestões de categoria, por org. Chamado pela rota semanal e pelo botão da
 * tela de metas. Deps injetadas para ser testável sem banco (mesmo molde de
 * notifications/pacing-email-job.ts).
 */
import {
  suggestCategories,
  type CategorySuggestion,
  type SuggestCategoriesInput,
} from '@floow/core-finance'

export interface ExistingSuggestion {
  id: string
  fingerprint: string
  status: 'pending' | 'accepted' | 'dismissed'
}

export interface SuggestionSyncPlan {
  inserts: CategorySuggestion[]
  updates: { id: string; suggestion: CategorySuggestion }[]
  deleteIds: string[]
}

export interface CategorySuggestionDeps {
  loadInput(orgId: string): Promise<Omit<SuggestCategoriesInput, 'excludedFingerprints'>>
  loadExisting(orgId: string): Promise<ExistingSuggestion[]>
  apply(orgId: string, plan: SuggestionSyncPlan): Promise<void>
}

export function planSuggestionSync(existing: ExistingSuggestion[], fresh: CategorySuggestion[]): SuggestionSyncPlan {
  const porFingerprint = new Map(existing.map((e) => [e.fingerprint, e]))
  const frescas = new Set(fresh.map((s) => s.fingerprint))
  const plan: SuggestionSyncPlan = { inserts: [], updates: [], deleteIds: [] }

  for (const s of fresh) {
    const atual = porFingerprint.get(s.fingerprint)
    if (!atual) plan.inserts.push(s)
    else if (atual.status === 'pending') plan.updates.push({ id: atual.id, suggestion: s })
  }
  // Pendente que o motor não devolve mais: o dado mudou, a sugestão perdeu sentido.
  for (const e of existing) {
    if (e.status === 'pending' && !frescas.has(e.fingerprint)) plan.deleteIds.push(e.id)
  }
  return plan
}

export async function runCategorySuggestionsForOrg(
  orgId: string,
  deps: CategorySuggestionDeps,
): Promise<{ pending: number }> {
  const [input, existing] = await Promise.all([deps.loadInput(orgId), deps.loadExisting(orgId)])
  const excludedFingerprints = new Set(existing.filter((e) => e.status !== 'pending').map((e) => e.fingerprint))
  const fresh = suggestCategories({ ...input, excludedFingerprints })
  await deps.apply(orgId, planSuggestionSync(existing, fresh))
  return { pending: fresh.length }
}
