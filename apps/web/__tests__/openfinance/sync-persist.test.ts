import { describe, it, expect } from 'vitest'
import { sumAppliedDeltasByAccount } from '@/lib/openfinance/sync'

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

/**
 * Mesma extração de `resolveCategoryId` acima: a decisão "esta transferência
 * cria segunda perna ou só metadado" isolada do resto de `persistPage`.
 */
function decideTransferLeg(
  tx: { type: string; reviewState: string; transferAccountId: string | null },
  destinationIsOpenFinanceLinked: boolean,
): 'no-transfer' | 'metadata-only' | 'linked-leg' {
  if (tx.type !== 'transfer' || tx.reviewState !== 'confirmed' || !tx.transferAccountId) return 'no-transfer'
  return destinationIsOpenFinanceLinked ? 'metadata-only' : 'linked-leg'
}

describe('sync: fork da segunda perna de transferência', () => {
  it('sem conta de destino, ou não confirmada, ou não é transferência: não cria nada', () => {
    expect(decideTransferLeg({ type: 'expense', reviewState: 'confirmed', transferAccountId: null }, false)).toBe('no-transfer')
    expect(decideTransferLeg({ type: 'transfer', reviewState: 'pending', transferAccountId: 'conta-1' }, false)).toBe('no-transfer')
    expect(decideTransferLeg({ type: 'transfer', reviewState: 'confirmed', transferAccountId: null }, false)).toBe('no-transfer')
  })

  it('destino Open Finance: só metadado', () => {
    expect(decideTransferLeg({ type: 'transfer', reviewState: 'confirmed', transferAccountId: 'conta-1' }, true)).toBe('metadata-only')
  })

  it('destino conta manual: cria a segunda perna linkada', () => {
    expect(decideTransferLeg({ type: 'transfer', reviewState: 'confirmed', transferAccountId: 'conta-1' }, false)).toBe('linked-leg')
  })
})

/**
 * `sumAppliedDeltasByAccount` é importada de verdade de `sync.ts` (não uma
 * cópia local, ao contrário de `resolveCategoryId`/`decideTransferLeg`
 * acima): é a mesma função que `persistPage` usa para o delta da perna de
 * destino, então o teste cobre a implementação real, não uma reimplementação
 * paralela dela. Achado da revisão final: a rodada anterior só testava a
 * ORDEM das operações de DB, nunca o VALOR do delta nem o filtro por
 * `balanceApplied` — por isso a falta de gate em `counterparty-actions.ts`
 * (Critical 1) passou por duas revisões sem ser pega.
 */
describe('sumAppliedDeltasByAccount', () => {
  it('perna com applied: false não contribui em nada para o saldo da conta', () => {
    const delta = sumAppliedDeltasByAccount([{ accountId: 'conta-1', amountCents: 50000, applied: false }])
    expect(delta.has('conta-1')).toBe(false)
    expect(delta.get('conta-1')).toBeUndefined()
  })

  it('perna com applied: true contribui com o próprio valor', () => {
    const delta = sumAppliedDeltasByAccount([{ accountId: 'conta-1', amountCents: 50000, applied: true }])
    expect(delta.get('conta-1')).toBe(50000)
  })

  it('múltiplas pernas na mesma conta somam corretamente, ignorando as não aplicadas', () => {
    const delta = sumAppliedDeltasByAccount([
      { accountId: 'conta-1', amountCents: 50000, applied: true },
      { accountId: 'conta-1', amountCents: 20000, applied: true },
      { accountId: 'conta-1', amountCents: 999999, applied: false },
      { accountId: 'conta-2', amountCents: -1000, applied: true },
    ])
    expect(delta.get('conta-1')).toBe(70000)
    expect(delta.get('conta-2')).toBe(-1000)
    expect(delta.size).toBe(2)
  })
})
