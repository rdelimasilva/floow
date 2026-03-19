import { describe, it, expect } from 'vitest'
import { matchCategory, CategoryRule } from '../categorization'

const makeRule = (
  overrides: Partial<CategoryRule> & { categoryId: string; matchType: CategoryRule['matchType']; matchValue: string }
): CategoryRule => ({
  id: overrides.id ?? 'rule-1',
  matchType: overrides.matchType,
  matchValue: overrides.matchValue,
  categoryId: overrides.categoryId,
  priority: overrides.priority ?? 0,
  isEnabled: overrides.isEnabled ?? true,
})

describe('matchCategory', () => {
  it('returns null when rules array is empty', () => {
    expect(matchCategory('Netflix subscription', [])).toBeNull()
  })

  it('returns null when description is empty string', () => {
    const rule = makeRule({ matchType: 'contains', matchValue: 'netflix', categoryId: 'cat-1' })
    expect(matchCategory('', [rule])).toBeNull()
  })

  it('returns categoryId for exact match (case-insensitive)', () => {
    const rule = makeRule({ matchType: 'exact', matchValue: 'netflix', categoryId: 'cat-netflix' })
    expect(matchCategory('Netflix', [rule])).toBe('cat-netflix')
  })

  it('returns categoryId for exact match when description already lowercase', () => {
    const rule = makeRule({ matchType: 'exact', matchValue: 'Netflix', categoryId: 'cat-netflix' })
    expect(matchCategory('netflix', [rule])).toBe('cat-netflix')
  })

  it('returns null for exact match when description only contains the value (not equals)', () => {
    const rule = makeRule({ matchType: 'exact', matchValue: 'netflix', categoryId: 'cat-netflix' })
    expect(matchCategory('Pagamento Netflix Mensal', [rule])).toBeNull()
  })

  it('returns categoryId for contains match (case-insensitive)', () => {
    const rule = makeRule({ matchType: 'contains', matchValue: 'netflix', categoryId: 'cat-streaming' })
    expect(matchCategory('Pagamento Netflix', [rule])).toBe('cat-streaming')
  })

  it('returns categoryId for contains match when matchValue is uppercase and description is mixed', () => {
    const rule = makeRule({ matchType: 'contains', matchValue: 'NETFLIX', categoryId: 'cat-streaming' })
    expect(matchCategory('pagamento netflix mensal', [rule])).toBe('cat-streaming')
  })

  it('returns null when no rule matches', () => {
    const rule = makeRule({ matchType: 'contains', matchValue: 'spotify', categoryId: 'cat-streaming' })
    expect(matchCategory('Pagamento Netflix', [rule])).toBeNull()
  })

  it('returns highest-priority match when multiple rules match (rules pre-sorted by priority DESC)', () => {
    // Rules must be passed pre-sorted by priority DESC — first match wins
    const highPriority = makeRule({
      id: 'rule-high',
      matchType: 'contains',
      matchValue: 'netflix',
      categoryId: 'cat-streaming',
      priority: 10,
    })
    const lowPriority = makeRule({
      id: 'rule-low',
      matchType: 'contains',
      matchValue: 'pagamento',
      categoryId: 'cat-general',
      priority: 1,
    })
    // Both rules match "Pagamento Netflix" — high priority should win (comes first in sorted array)
    expect(matchCategory('Pagamento Netflix', [highPriority, lowPriority])).toBe('cat-streaming')
  })

  it('returns lower priority match if higher priority rule does not match', () => {
    const highPriority = makeRule({
      id: 'rule-high',
      matchType: 'exact',
      matchValue: 'spotify',
      categoryId: 'cat-streaming',
      priority: 10,
    })
    const lowPriority = makeRule({
      id: 'rule-low',
      matchType: 'contains',
      matchValue: 'pagamento',
      categoryId: 'cat-general',
      priority: 1,
    })
    expect(matchCategory('Pagamento Netflix', [highPriority, lowPriority])).toBe('cat-general')
  })

  it('evaluates disabled rules if passed (caller is responsible for filtering)', () => {
    // Function evaluates all rules including disabled ones — caller must pre-filter
    const disabledRule = makeRule({
      matchType: 'contains',
      matchValue: 'netflix',
      categoryId: 'cat-streaming',
      isEnabled: false,
    })
    // Even disabled rule matches — function does not check isEnabled
    expect(matchCategory('Pagamento Netflix', [disabledRule])).toBe('cat-streaming')
  })
})
