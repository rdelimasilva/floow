type Natureza = 'income' | 'expense' | 'transfer'

export interface PrevisaoParaHeranca {
  type: Natureza
  categoryId: string | null
}

export interface RealizadoParaHeranca {
  reviewState: 'confirmed' | 'pending'
  type: Natureza
  categoryId: string | null
  isAutoCategorized: boolean
  transferGroupId?: string | null
}

/**
 * O que o lançamento do banco herda da previsão de recorrência a que foi
 * vinculado. A previsão é o usuário dizendo o que aquele dinheiro é.
 *
 * - `classificar`: o realizado está pendente — ganha natureza e categoria.
 * - `substituir`: confirmado com categoria automática (regra, contraparte
 *   confirmada aplicada no sync, categoria da Polp) ou sem categoria — a da
 *   previsão substitui, como na absorção (`efeitoDaAbsorcao`). Ex.: Pix do
 *   terapeuta em "Outras despesas de saúde" pela contraparte, previsão em
 *   Psicólogo — sem isso a meta de Psicólogo nunca vê o gasto.
 * - `null`: nada muda. Categoria escolhida à mão fica; transferência e
 *   natureza diferente não são trocadas por aqui.
 *
 * Nunca troca por uma mais genérica: se a categoria atual descende da da
 * previsão (`ancestraisDaAtual`, pais e avós dela), a atual é mais
 * específica e é ela que alimenta metas como "Assistente de limpeza" — fica.
 * Saúde → Psicólogo (ida para a filha) troca.
 *
 * `substituir` ainda depende de o usuário não ter decidido aquela linha
 * (evento em `validacoes`): `is_auto_categorized` não era desligado na
 * edição do lançamento antes de 18/10/2026. Quem chama confere.
 */
export function herancaDaPrevisao(
  previsao: PrevisaoParaHeranca,
  realizado: RealizadoParaHeranca,
  ancestraisDaAtual: readonly string[] = [],
): 'classificar' | 'substituir' | null {
  if (previsao.type === 'transfer' || !previsao.categoryId) return null
  if (realizado.reviewState === 'pending') return 'classificar'
  if (realizado.type !== previsao.type || realizado.transferGroupId) return null
  if (realizado.categoryId === previsao.categoryId) return null
  if (realizado.categoryId !== null && !realizado.isAutoCategorized) return null
  if (ancestraisDaAtual.includes(previsao.categoryId)) return null
  return 'substituir'
}
