# Phase 5: Automation Foundation - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Create the database schema (migration 00006_automation.sql) and pure functions for both v1.1 automation features: category rules and recurring transactions. This phase delivers testable infrastructure only — no UI, no server actions, no user-facing features. Phases 6 and 7 build on this foundation.

</domain>

<decisions>
## Implementation Decisions

### Already Locked (from research)
- Rules apply only when `category_id IS NULL` — never overwrite manual categories
- `priority` column on category_rules with `ORDER BY priority DESC` for deterministic conflict resolution
- Match types: `contains` and `exact`
- Recurring generation is user-triggered in v1.1 (cron deferred to v2)
- `(recurring_template_id, due_date)` unique constraint prevents duplicate generation
- `date-fns@^4.1.0` is the only new dependency (added to core-finance)
- 6 frequencies: daily, weekly, biweekly, monthly, quarterly, yearly

### Claude's Discretion
- Rule matching case sensitivity (case-insensitive recommended for user-friendliness)
- Whether "contains" matches substring or word boundaries
- Month-end date handling strategy (clamp vs overflow) for recurring dates
- Recurring template optional fields (notes, end date, max occurrences)
- Exact column types and constraints for both tables
- GIN index strategy for text search on category_rules
- Test coverage boundaries and edge case selection
- File organization within core-finance (single file vs split)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Migration pattern (00001-00005): RLS via `get_user_org_ids()`, btree indexes on org_id, consistent policy naming
- `categories` table: uuid `id`, nullable `org_id`, `name`, `type` (transaction_type enum) — category_rules will FK to this
- `transactions` table: `description` (text), `category_id` (uuid nullable) — matchCategory operates on these
- vitest test pattern: `describe/it/expect` in `src/__tests__/` directory
- Pure function pattern: no side effects, thin DB wrapper separate (see balance.ts, portfolio.ts)

### Established Patterns
- Integer cents for all monetary values (amount_cents on recurring_templates)
- Barrel exports from `packages/core-finance/src/index.ts` — new modules add `export * from './module'`
- `transaction_type` enum already exists: `'income' | 'expense' | 'transfer'`
- `account_type` enum already exists: `'checking' | 'savings' | 'brokerage' | 'credit_card' | 'cash'`

### Integration Points
- `@floow/core-finance/src/index.ts` — add exports for new modules (categorization, recurring)
- `supabase/migrations/` — new file `00006_automation.sql`
- `packages/core-finance/package.json` — add `date-fns@^4.1.0` dependency

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User delegated all implementation decisions to Claude.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-automation-foundation*
*Context gathered: 2026-03-18*
