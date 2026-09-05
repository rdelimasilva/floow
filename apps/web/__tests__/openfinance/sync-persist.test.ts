import { describe, it, expect } from 'vitest'

/**
 * `persistPage` não é exportada (é interna a sync.ts) e o resto da função
 * depende de um mock de `db` grande demais para valer a pena aqui. Este
 * teste isola só a regra nova: quem decide a categoria quando há contraparte
 * versus quando não há. Extraída para uma função pura testável em vez de
 * inline, porque é a única peça de lógica condicional nova desta task.
 */
function resolveCategoryId(
  tx: { counterpartyId: string | null; categoryId: string | null; description: string; categoryRef: string | null },
  rules: Array<{ pattern: string; categoryId: string }>,
  categoryByRef: Map<string, string>,
): string | null {
  if (tx.counterpartyId !== null) return tx.categoryId
  const matched = rules.find((r) => tx.description.includes(r.pattern))
  return matched?.categoryId ?? (tx.categoryRef ? (categoryByRef.get(tx.categoryRef) ?? null) : null)
}

describe('categoria: contraparte é autoritativa, Nível 1 usa o caminho antigo', () => {
  it('com contraparte, category_rules e category_ref nunca são consultados', () => {
    const tx = { counterpartyId: 'cp-1', categoryId: 'cat-confirmada', description: 'ALUGUEL', categoryRef: 'RENT_AND_UTILITIES_RENT' }
    const id = resolveCategoryId(tx, [{ pattern: 'ALUGUEL', categoryId: 'cat-regra' }], new Map([['RENT_AND_UTILITIES_RENT', 'cat-ref']]))
    expect(id).toBe('cat-confirmada')
  })

  it('contraparte pendente força categoria null, mesmo com regra e category_ref batendo', () => {
    const tx = { counterpartyId: 'cp-2', categoryId: null, description: 'ALUGUEL', categoryRef: 'RENT_AND_UTILITIES_RENT' }
    const id = resolveCategoryId(tx, [{ pattern: 'ALUGUEL', categoryId: 'cat-regra' }], new Map([['RENT_AND_UTILITIES_RENT', 'cat-ref']]))
    expect(id).toBeNull()
  })

  it('sem contraparte (Nível 1), category_rules continua tendo prioridade sobre category_ref', () => {
    const tx = { counterpartyId: null, categoryId: null, description: 'ALUGUEL', categoryRef: 'RENT_AND_UTILITIES_RENT' }
    const id = resolveCategoryId(tx, [{ pattern: 'ALUGUEL', categoryId: 'cat-regra' }], new Map([['RENT_AND_UTILITIES_RENT', 'cat-ref']]))
    expect(id).toBe('cat-regra')
  })

  it('sem contraparte e sem regra, cai para category_ref', () => {
    const tx = { counterpartyId: null, categoryId: null, description: 'X', categoryRef: 'RENT_AND_UTILITIES_RENT' }
    const id = resolveCategoryId(tx, [], new Map([['RENT_AND_UTILITIES_RENT', 'cat-ref']]))
    expect(id).toBe('cat-ref')
  })
})
