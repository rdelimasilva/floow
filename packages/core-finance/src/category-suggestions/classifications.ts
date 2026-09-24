/**
 * Aplica a decisão do classificador (Claude) às sugestões que o motor não
 * soube resolver sozinho. Função pura: quem chama a API fica no app.
 *
 * O motor agrupa por estabelecimento/pessoa, mas não sabe o que o gasto é:
 * "PIX para Maraisa" pode ser diarista, aluguel ou presente. O classificador
 * recebe o grupo com exemplos e as categorias existentes e decide.
 */
import { normalizeCategoryName } from './merchant-key'
import { dedupePorNome, isGenericCategory, type CategorySuggestion, type SuggestionCategory } from './suggest'

export type SuggestionDecision =
  | { fingerprint: string; action: 'existing'; categoryId: string }
  | { fingerprint: string; action: 'new'; name: string }
  | { fingerprint: string; action: 'ignore' }

/** Nome de categoria nova aceito do classificador. */
const NOME_MAX = 40

/** Sugestões que precisam de decisão: as que ainda não têm categoria de destino. */
export function needsClassification(s: CategorySuggestion): boolean {
  return s.targetCategoryId === null
}

export function applyClassifications(
  suggestions: CategorySuggestion[],
  decisions: SuggestionDecision[],
  categories: SuggestionCategory[],
  existingNames: string[] = [],
): CategorySuggestion[] {
  const porFingerprint = new Map(decisions.map((d) => [d.fingerprint, d]))
  const destinosValidos = new Map(categories.filter((c) => !isGenericCategory(c)).map((c) => [c.id, c]))
  const porNome = new Map([...destinosValidos.values()].map((c) => [normalizeCategoryName(c.name), c]))
  const outrosNomes = new Set(existingNames.map(normalizeCategoryName))

  const resultado: CategorySuggestion[] = []
  for (const s of suggestions) {
    if (!needsClassification(s)) {
      resultado.push(s)
      continue
    }
    const d = porFingerprint.get(s.fingerprint)
    // Sem decisão (classificador fora do ar, resposta incompleta): não mostra.
    // Nome inventado a partir da descrição foi exatamente o que deu errado.
    if (!d || d.action === 'ignore') continue

    if (d.action === 'existing') {
      const alvo = destinosValidos.get(d.categoryId)
      if (alvo && !s.sourceCategoryIds.includes(alvo.id)) {
        resultado.push({ ...s, targetCategoryId: alvo.id, suggestedName: alvo.name })
      }
      continue
    }

    const nome = d.name.trim()
    if (!nome || nome.length > NOME_MAX) continue
    const existente = porNome.get(normalizeCategoryName(nome))
    if (existente) {
      if (!s.sourceCategoryIds.includes(existente.id)) {
        resultado.push({ ...s, targetCategoryId: existente.id, suggestedName: existente.name })
      }
      continue
    }
    if (outrosNomes.has(normalizeCategoryName(nome))) continue
    resultado.push({ ...s, suggestedName: nome })
  }

  return dedupePorNome(resultado).sort((a, b) => b.totalCents - a.totalCents)
}
