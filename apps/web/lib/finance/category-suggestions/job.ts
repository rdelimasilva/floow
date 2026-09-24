/**
 * Sugestões de categoria, por org. Chamado pela rota semanal e pelo botão da
 * tela de metas. Deps injetadas para ser testável sem banco (mesmo molde de
 * notifications/pacing-email-job.ts).
 */
import {
  SUGGESTION_LIMITS,
  applyClassifications,
  needsClassification,
  suggestCategories,
  type CategorySuggestion,
  type SuggestCategoriesInput,
  type SuggestionCategory,
  type SuggestionDecision,
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
  /**
   * Decide o destino das sugestões que o motor não resolveu (Claude). Ausente
   * — sem chave de API — essas sugestões simplesmente não aparecem.
   */
  classify?(pending: CategorySuggestion[], categories: SuggestionCategory[]): Promise<SuggestionDecision[]>
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
  const candidatas = suggestCategories({ ...input, excludedFingerprints, limit: SUGGESTION_LIMITS.maxCandidates })

  const aClassificar = candidatas.filter(needsClassification)
  let decisoes: SuggestionDecision[] = []
  if (aClassificar.length > 0 && deps.classify) {
    try {
      decisoes = await deps.classify(aClassificar, input.categories)
    } catch (err) {
      // Classificador fora do ar não derruba a rodada: seguem só as sugestões
      // que já têm categoria de destino.
      console.error(`[sugestoes] classificador falhou para org=${orgId}:`, err)
    }
  }

  const fresh = applyClassifications(candidatas, decisoes, input.categories, input.existingNames)
    .filter((s) => !excludedFingerprints.has(s.fingerprint))
    .slice(0, SUGGESTION_LIMITS.maxSuggestions)
  await deps.apply(orgId, planSuggestionSync(existing, fresh))
  return { pending: fresh.length }
}
