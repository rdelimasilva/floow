/**
 * Category rule matching — pure functions for transaction auto-categorization.
 *
 * Preconditions for matchCategory:
 * - `rules` must be pre-sorted by `priority DESC` (highest priority first)
 * - Callers should pass only enabled rules (isEnabled: true), but the function
 *   does NOT check isEnabled — filtering is the caller's responsibility
 * - Call only when the transaction's category_id IS NULL; never overwrite manual categories
 */

/** The two supported match strategies for category rules. */
export type MatchType = 'contains' | 'exact'

/** A single category rule used to auto-assign a category to a transaction. */
export interface CategoryRule {
  /** Unique identifier for this rule. */
  id: string
  /** How to match the transaction description against matchValue. */
  matchType: MatchType
  /** The string pattern to match against (case-insensitive). */
  matchValue: string
  /** The category to assign when this rule matches. */
  categoryId: string
  /**
   * Priority for conflict resolution. Higher value = higher priority.
   * Rules must be passed pre-sorted by priority DESC.
   */
  priority: number
  /**
   * Whether this rule is active.
   * NOTE: The function does NOT filter by isEnabled — the caller must pass only
   * enabled rules. If a disabled rule is included it will still be evaluated.
   */
  isEnabled: boolean
}

/**
 * Matches a transaction description against an ordered list of category rules.
 *
 * Returns the `categoryId` of the first matching rule, or `null` if no rule matches.
 *
 * @param description - The transaction description to test (e.g. "Pagamento Netflix")
 * @param rules - Category rules pre-sorted by priority DESC. Only enabled rules
 *   should be included; this function does not filter by isEnabled.
 * @returns The matched categoryId, or null if description is empty or no rule matches.
 */
export function matchCategory(description: string, rules: CategoryRule[]): string | null {
  if (!description || rules.length === 0) return null

  const lowerDesc = description.toLowerCase()

  for (const rule of rules) {
    const lowerValue = rule.matchValue.toLowerCase()

    if (rule.matchType === 'exact' && lowerDesc === lowerValue) {
      return rule.categoryId
    }

    if (rule.matchType === 'contains' && lowerDesc.includes(lowerValue)) {
      return rule.categoryId
    }
  }

  return null
}
