# Phase 5: Automation Foundation - Research

**Researched:** 2026-03-18
**Domain:** PostgreSQL schema migration, pure TypeScript functions, date-fns v4, vitest testing
**Confidence:** HIGH

## Summary

Phase 5 is a pure infrastructure phase: one SQL migration and two TypeScript modules in `@floow/core-finance`. There is no UI, no server actions, and no user-facing behavior. The deliverables are a migration file (`00006_automation.sql`) that creates two new tables with RLS, and two pure-function modules (`categorization.ts` and `recurring.ts`) that the planner exports through the existing barrel.

The codebase already has strong conventions from five prior migrations and ten vitest test files. This phase follows exactly the same patterns — it is strictly additive: no existing files are modified except `index.ts` (two new export lines) and `package.json` (one new dependency). All date arithmetic is handled by `date-fns@^4.1.0`, which must be added to `packages/core-finance/package.json`. The existing test infrastructure runs in 465ms and has zero gaps; new test files must be added for the two new modules.

The most consequential implementation decisions are around month-end edge cases in `addMonths` and text matching strategy for category rules. date-fns `addMonths` clamps to the last valid day of the target month (e.g., Jan 31 + 1 month = Feb 28). This is the correct behavior for recurring finance: it avoids overflow into the next month, and is what users expect. For category rule matching, case-insensitive substring (`LOWER(description) LIKE LOWER('%' || match_value || '%')`) at the application layer is the right default — simple, portable, and consistent with how Phases 6/7 will implement server actions.

**Primary recommendation:** Build `00006_automation.sql` following the established migration pattern exactly; add `date-fns@^4.1.0` to `packages/core-finance/package.json`; create `categorization.ts` and `recurring.ts` as pure modules with full vitest coverage; wire both into `index.ts`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| date-fns | ^4.1.0 | Date arithmetic for recurring templates | Locked decision; pure functional, tree-shakeable, zero dependencies, first-class TypeScript |
| vitest | ^3.0.0 | Unit testing | Already in devDependencies of core-finance; all 10 existing test files use it |
| TypeScript | catalog: (^5.7.0) | Type safety | Already canonical in the monorepo |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @date-fns/tz | (not needed) | Timezone-aware dates | NOT needed — all dates are calendar dates (date type), not timestamps; BRL timezone irrelevant at schema layer |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| date-fns addMonths | Temporal API | Temporal is Stage 3; not universally available; date-fns is locked decision |
| pg_trgm GIN index | tsvector full-text | pg_trgm supports ILIKE directly without query changes; tsvector needs stemming config inappropriate for transaction descriptions |
| pg_trgm GIN index | plain btree | btree cannot accelerate LIKE '%substring%'; GIN+pg_trgm is the correct choice |
| Case-insensitive app-layer | ICU collation in Postgres | ICU collation more complex to configure in Supabase; app-layer is simpler and adequate for rule matching volume |

**Installation (only change required in package.json):**
```bash
# In packages/core-finance/
pnpm add date-fns@^4.1.0
```

---

## Architecture Patterns

### New Files in core-finance/src/
```
packages/core-finance/src/
├── categorization.ts        # matchCategory() pure function
├── recurring.ts             # getOverdueDates(), advanceByFrequency() pure functions
└── __tests__/
    ├── categorization.test.ts
    └── recurring.test.ts
```

Two new source files, two new test files. Only `index.ts` is modified (two lines appended).

### Migration File
```
supabase/migrations/
└── 00006_automation.sql     # category_rules + recurring_templates tables
```

### Pattern 1: Migration Structure (established pattern from 00002–00005)
**What:** Single SQL file, sections separated by comment banners, order: TABLES -> INDEXES -> RLS policies
**When to use:** All schema changes follow this exact layout
**Example (from 00005_planning.sql):**
```sql
-- =============================================================================
-- Floow Automation Migration 00006
-- Automation schema: category_rules, recurring_templates
-- =============================================================================

-- TABLES
-- UNIQUE INDEXES (enables deduplication constraints)
-- PERFORMANCE INDEXES (btree on org_id for RLS)
-- ROW LEVEL SECURITY
```

### Pattern 2: RLS Policy Naming (established pattern)
**What:** Descriptive string policy names: `"table_name: members can select"`
**When to use:** Every new table gets 4 policies (select, insert, update, delete)
**Example:**
```sql
ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "category_rules: members can select"
  ON public.category_rules FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "category_rules: members can insert"
  ON public.category_rules FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "category_rules: members can update"
  ON public.category_rules FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "category_rules: members can delete"
  ON public.category_rules FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
```

### Pattern 3: Pure Function Module (established pattern from balance.ts, portfolio.ts, simulation.ts)
**What:** No DB imports at runtime. Export interfaces and functions. JSDoc on every exported symbol.
**When to use:** All `@floow/core-finance` business logic
**Example:**
```typescript
// Source: packages/core-finance/src/portfolio.ts (established pattern)
/**
 * Input interface for a categorization rule.
 * Safe to use on both client and server (no DB dependency at runtime).
 */
export interface CategoryRule {
  id: string
  matchType: 'contains' | 'exact'
  matchValue: string
  categoryId: string
  priority: number
  isEnabled: boolean
}

/**
 * Pure function: returns the matching category ID for a transaction description.
 * Rules are pre-sorted by priority DESC before calling this function.
 * Returns null if no rule matches or input is empty.
 */
export function matchCategory(
  description: string,
  rules: CategoryRule[]
): string | null {
  // ...
}
```

### Pattern 4: Barrel Export (established pattern from index.ts)
**What:** One `export * from './module'` line per module, with phase comment
**When to use:** Every new module in core-finance
**Example:**
```typescript
// Phase 5 — Automation foundation
export * from './categorization'
export * from './recurring'
```

### Pattern 5: Vitest Test File Structure (established pattern)
**What:** `describe/it/expect` blocks, import directly from module (not index), one describe per function
**When to use:** All unit tests
**Example (from balance.test.ts, simulation.test.ts):**
```typescript
import { describe, it, expect } from 'vitest'
import { matchCategory } from '../categorization'
import type { CategoryRule } from '../categorization'

describe('matchCategory', () => {
  it('returns null when rules array is empty', () => {
    expect(matchCategory('Netflix', [])).toBeNull()
  })

  it('returns categoryId for exact match (case-insensitive)', () => {
    const rules: CategoryRule[] = [
      { id: '1', matchType: 'exact', matchValue: 'netflix', categoryId: 'cat-1', priority: 10, isEnabled: true }
    ]
    expect(matchCategory('Netflix', rules)).toBe('cat-1')
  })
})
```

### Anti-Patterns to Avoid
- **DB imports in pure modules:** Do not import from `@floow/db` or drizzle-orm in `categorization.ts` or `recurring.ts`. The DB wrappers live in server actions (Phases 6/7).
- **`new Date()` in pure functions:** Functions that compute next due dates take an explicit `referenceDate: Date` parameter, not `new Date()` internally — makes unit testing deterministic.
- **`addQuarters` from date-fns for quarterly:** Use it — it calls `addMonths(date, 3)` internally, which is correct behavior.
- **Storing dates as timestamps in migration:** `due_date` on recurring_templates is `date` type, not `timestamptz` — avoids timezone conversion issues for calendar-based recurrence.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Adding months/quarters to a date | Custom month arithmetic | `date-fns` addMonths, addQuarters | Month-end edge cases (Jan 31 + 1 = Feb 28) are non-trivial; date-fns has 10 years of battle-tested edge case handling |
| Adding weeks/biweekly | Manual day multiplication | `date-fns` addWeeks | Handles DST correctly; addWeeks(date, 2) for biweekly |
| Adding days for daily frequency | Manual millisecond math | `date-fns` addDays | Handles DST transitions |
| Text substring matching | Custom regex engine | Plain `includes()` with `toLowerCase()` | For an in-memory pure function with <100 rules, String.includes is correct and fast |
| GIN index for text in Postgres | btree | `CREATE INDEX ... USING gin (match_value gin_trgm_ops)` with pg_trgm extension | Required for ILIKE '%substring%' to use an index (btree cannot do this) |

**Key insight:** The date arithmetic in `advanceByFrequency` looks simple but hides real edge cases. Jan 31 -> Feb 28 -> Mar 28 (not Mar 31) is correct behavior for finance (you stay on the 28th once you've landed there). Hand-rolling this produces subtle bugs on month-end.

---

## Common Pitfalls

### Pitfall 1: date-fns addMonths Month-End Clamp Behavior
**What goes wrong:** addMonths(new Date('2024-01-31'), 1) returns Feb 28, not Mar 3 (no overflow). This is intentional. The next call addMonths(new Date('2024-02-28'), 1) returns Mar 28, not Mar 31 — the original day-of-month (31) is lost.
**Why it happens:** date-fns clamps to the last valid day of the target month. Once you land on the 28th (because you started on the 31st), subsequent months will use the 28th.
**How to avoid:** This is the CORRECT behavior for recurring finance transactions. Document it clearly in the function JSDoc. Do NOT try to remember the "intended" day-of-month — the clamp is what users expect (rent due on the "last day of the month" means Feb 28).
**Warning signs:** Tests that check Jan 31 -> Feb 28 -> Mar 31 (wrong) instead of Jan 31 -> Feb 28 -> Mar 28 (right).

### Pitfall 2: Unique Constraint on (recurring_template_id, due_date) Requires date Type
**What goes wrong:** If `due_date` is stored as `timestamptz`, the unique constraint can be bypassed by inserting at different times on the same calendar day.
**Why it happens:** Timestamps include time components; two inserts at different times are "different" timestamps even on the same date.
**How to avoid:** `due_date date NOT NULL` in the migration — pure calendar date, no time component. The unique constraint `UNIQUE (recurring_template_id, due_date)` then works correctly.

### Pitfall 3: Forgetting pg_trgm Extension for GIN Index
**What goes wrong:** Migration applies, but `CREATE INDEX ... USING gin (match_value gin_trgm_ops)` fails because the pg_trgm extension is not enabled.
**Why it happens:** pg_trgm is a Postgres extension that must be explicitly enabled.
**How to avoid:** Add `CREATE EXTENSION IF NOT EXISTS pg_trgm;` at the top of the migration, before the index creation. Supabase enables this on all projects but the explicit `IF NOT EXISTS` guard is safe.
**Warning signs:** Migration error: `operator class "gin_trgm_ops" does not exist`.

### Pitfall 4: Enabling pg_trgm Extension on Every Fresh DB Apply
**What goes wrong:** A team member runs `supabase db reset` and the migration fails if pg_trgm was pre-enabled only in production.
**Why it happens:** Extension state is not part of migrations unless explicitly declared.
**How to avoid:** Include `CREATE EXTENSION IF NOT EXISTS pg_trgm;` idempotently in 00006_automation.sql.

### Pitfall 5: category_rules FK to categories Without Org Scoping
**What goes wrong:** A user could create a rule pointing to a system category (org_id IS NULL) from another org's category — violating multi-tenant isolation.
**Why it happens:** FK to `categories(id)` is valid because system categories exist, but the rule's `category_id` FK should allow pointing to system categories (the same pattern already used for transactions.category_id).
**How to avoid:** The FK `category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE` is correct. The RLS on `category_rules` guarantees org isolation at the rule level. System categories are intentionally accessible to all orgs (same as in 00002 design).

### Pitfall 6: isEnabled Filter in matchCategory Must Be Applied by Caller or Inside Function
**What goes wrong:** If `matchCategory` receives disabled rules in the input array, it will incorrectly apply them.
**Why it happens:** The function is pure — it only knows what it's given.
**How to avoid:** Filter `isEnabled: true` rules BEFORE calling `matchCategory`. Document this precondition in the function JSDoc. The Phase 6 server action applies the filter at DB query time; for tests, include disabled rule test cases to verify the function ignores them if passed (or document that disabled rules should not be passed).

### Pitfall 7: advanceByFrequency vs getOverdueDates Separation of Concerns
**What goes wrong:** Conflating "what dates are overdue?" with "what is the next due date after generation?". These are two different operations needed by different callers.
**Why it happens:** They seem similar because both involve date arithmetic.
**How to avoid:** Keep them as two separate exported functions. `getOverdueDates(template, referenceDate)` returns all due dates from `nextDueDate` up to `referenceDate` (inclusive). `advanceByFrequency(date, frequency)` returns the single next date after a given date. Both are pure.

---

## Code Examples

Verified patterns from official sources and established codebase patterns:

### Migration Table: category_rules
```sql
-- Source: established pattern from 00002_finance.sql and 00005_planning.sql
CREATE TABLE public.category_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  category_id   uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  match_type    text NOT NULL CHECK (match_type IN ('contains', 'exact')),
  match_value   text NOT NULL,
  priority      integer NOT NULL DEFAULT 0,
  is_enabled    boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### Migration Table: recurring_templates
```sql
-- Source: established pattern; amount_cents = integer cents convention from balance.ts
CREATE TABLE public.recurring_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id     uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  type            transaction_type NOT NULL,
  amount_cents    integer NOT NULL,
  description     text NOT NULL,
  frequency       text NOT NULL CHECK (frequency IN ('daily','weekly','biweekly','monthly','quarterly','yearly')),
  next_due_date   date NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### Migration: Generated Transactions Link
```sql
-- Prevents duplicate generation: same template + same due date = conflict
-- Source: locked decision from CONTEXT.md
CREATE UNIQUE INDEX uq_generated_transactions
  ON public.transactions (recurring_template_id, due_date)
  WHERE recurring_template_id IS NOT NULL;

-- Requires adding recurring_template_id column to transactions table
ALTER TABLE public.transactions
  ADD COLUMN recurring_template_id uuid REFERENCES public.recurring_templates(id) ON DELETE SET NULL;
```

Note: The unique constraint approach requires adding `recurring_template_id` to the existing `transactions` table. This is an ALTER TABLE in 00006, not a new table — must be carefully ordered after the new tables are created.

### matchCategory Pure Function
```typescript
// Source: pattern from packages/core-finance/src/portfolio.ts + balance.ts
export type MatchType = 'contains' | 'exact'

export interface CategoryRule {
  id: string
  matchType: MatchType
  matchValue: string
  categoryId: string
  priority: number
  isEnabled: boolean
}

/**
 * Returns the categoryId of the first matching rule, or null if no rule matches.
 *
 * Preconditions:
 * - rules must be pre-sorted by priority DESC (highest priority first)
 * - only enabled rules should be passed (isEnabled === true)
 * - description matching is case-insensitive
 *
 * Rules apply only when category_id IS NULL on the transaction.
 * This function does NOT enforce that guard — callers must check before calling.
 */
export function matchCategory(
  description: string,
  rules: CategoryRule[]
): string | null {
  if (!description || rules.length === 0) return null

  const lowerDesc = description.toLowerCase()

  for (const rule of rules) {
    const lowerValue = rule.matchValue.toLowerCase()
    const matched =
      rule.matchType === 'exact'
        ? lowerDesc === lowerValue
        : lowerDesc.includes(lowerValue)

    if (matched) return rule.categoryId
  }

  return null
}
```

### Recurring Date Functions
```typescript
// Source: date-fns v4 API + established codebase patterns
import { addDays, addWeeks, addMonths, addQuarters, addYears } from 'date-fns'

export type RecurringFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'

/**
 * Advances a date by one period of the given frequency.
 * Month-end behavior: addMonths clamps to the last valid day
 * (e.g., Jan 31 + monthly = Feb 28). This is correct for financial recurrence.
 */
export function advanceByFrequency(
  date: Date,
  frequency: RecurringFrequency
): Date {
  switch (frequency) {
    case 'daily':     return addDays(date, 1)
    case 'weekly':    return addWeeks(date, 1)
    case 'biweekly':  return addWeeks(date, 2)
    case 'monthly':   return addMonths(date, 1)
    case 'quarterly': return addQuarters(date, 1)
    case 'yearly':    return addYears(date, 1)
  }
}

/**
 * Returns all dates that are due on or before referenceDate, starting from nextDueDate.
 * Used to determine which occurrences to generate when user triggers "Gerar agora".
 * Returns an empty array if nextDueDate is in the future.
 *
 * @param nextDueDate - First due date to check (inclusive)
 * @param frequency - Template frequency
 * @param referenceDate - Cutoff date (typically today)
 */
export function getOverdueDates(
  nextDueDate: Date,
  frequency: RecurringFrequency,
  referenceDate: Date
): Date[] {
  const dates: Date[] = []
  let current = nextDueDate

  while (current <= referenceDate) {
    dates.push(current)
    current = advanceByFrequency(current, frequency)
  }

  return dates
}
```

### date-fns v4 Import Style
```typescript
// Named imports from 'date-fns' — correct for v4 (ESM/CJS dual)
import { addDays, addWeeks, addMonths, addQuarters, addYears } from 'date-fns'
// NOT: import addMonths from 'date-fns/addMonths' (v2 style, deprecated)
```

### Test: Deterministic Date Testing
```typescript
// Source: vitest.dev/guide/mocking/dates + established test pattern
import { describe, it, expect } from 'vitest'
import { advanceByFrequency, getOverdueDates } from '../recurring'

describe('advanceByFrequency', () => {
  it('monthly: Jan 31 advances to Feb 28 (clamp behavior)', () => {
    const jan31 = new Date('2024-01-31')
    const result = advanceByFrequency(jan31, 'monthly')
    expect(result.toISOString().startsWith('2024-02-28')).toBe(true)
  })

  it('biweekly: adds exactly 14 days', () => {
    const start = new Date('2024-03-01')
    const result = advanceByFrequency(start, 'biweekly')
    expect(result.toISOString().startsWith('2024-03-15')).toBe(true)
  })
})

describe('getOverdueDates', () => {
  it('returns empty array when nextDueDate is in the future', () => {
    const future = new Date('2030-01-01')
    const today = new Date('2024-03-18')
    expect(getOverdueDates(future, 'monthly', today)).toHaveLength(0)
  })

  it('returns multiple dates for overdue monthly template', () => {
    const jan1 = new Date('2024-01-01')
    const mar18 = new Date('2024-03-18')
    const dates = getOverdueDates(jan1, 'monthly', mar18)
    expect(dates).toHaveLength(3) // Jan 1, Feb 1, Mar 1
  })
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| date-fns default import `import addMonths from 'date-fns/addMonths'` | Named import `import { addMonths } from 'date-fns'` | v3.0 (2023) | Import style must match v4 conventions |
| date-fns timezone via `date-fns-tz` separate package | `@date-fns/tz` integrated approach | v4.0 (2024) | Not needed for this phase (calendar dates only) |
| Single vitest.config.ts workspace | vitest projects config | vitest v3 | Core-finance has its own vitest.config.ts; this is correct |

**Deprecated/outdated:**
- Default imports from `date-fns/functionName`: Use named imports from `date-fns`
- `date-fns-tz` package: Replaced by `@date-fns/tz` in v4, but not needed here

---

## Open Questions

1. **Should `recurring_template_id` column be added to `transactions` in this migration or Phase 7?**
   - What we know: The unique constraint `(recurring_template_id, due_date)` requires the column to exist. This is a locked success criterion for Phase 5.
   - What's unclear: ALTER TABLE on `transactions` in 00006 is technically correct but couples schema changes across concerns.
   - Recommendation: Add `recurring_template_id` via ALTER TABLE in 00006. It is nullable, has no application impact until Phase 7, and the success criterion requires the constraint to be present after this migration runs.

2. **Which due_date column: on `transactions` or derived from unique constraint join?**
   - What we know: The unique constraint is `(recurring_template_id, due_date)` — but `transactions` table currently only has `date` column (not `due_date`).
   - What's unclear: The constraint uses `due_date` — this implies either reusing `transactions.date` (the transaction date equals the due date) or adding a separate `due_date` column to transactions.
   - Recommendation: Use `transactions.date` as the due-date equivalent (when a recurring transaction is generated, it's inserted with `date = due_date`). The unique index should then be `UNIQUE (recurring_template_id, date) WHERE recurring_template_id IS NOT NULL`. This avoids adding another column to transactions and aligns with how the generated transaction's date represents the occurrence date.

3. **GIN index on `category_rules.match_value` — worth including?**
   - What we know: The match happens in application code (matchCategory is a pure function). The DB GIN index would only benefit server-side SQL queries like "find all rules matching a description" — not the Phase 5 pure function.
   - What's unclear: Phase 6 may or may not query rules by match_value at DB layer.
   - Recommendation: Include the GIN index defensively in 00006 (it's cheap to add now, expensive to backfill later). Pattern: `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE INDEX idx_category_rules_match_value ON public.category_rules USING gin (match_value gin_trgm_ops);`

---

## Validation Architecture

> nyquist_validation is enabled in .planning/config.json

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^3.0.0 (v3.2.4 installed) |
| Config file | `packages/core-finance/vitest.config.ts` |
| Quick run command | `pnpm --filter @floow/core-finance test` |
| Full suite command | `pnpm --filter @floow/core-finance test` |

All 106 existing tests pass in 465ms. The test framework is fully operational.

### Phase Requirements → Test Map

This phase has no formal requirement IDs (infrastructure phase). The success criteria map directly to test coverage:

| Success Criterion | Behavior | Test Type | Automated Command | File Exists? |
|------------------|----------|-----------|-------------------|-------------|
| Migration runs cleanly | 00006_automation.sql syntax valid, tables created | manual (Supabase local) | `supabase db reset` | ❌ Wave 0 |
| matchCategory() correct match | Returns categoryId for matching rule | unit | `pnpm --filter @floow/core-finance test categorization` | ❌ Wave 0 |
| matchCategory() null on no match | Returns null when no rule matches | unit | `pnpm --filter @floow/core-finance test categorization` | ❌ Wave 0 |
| matchCategory() priority tie-breaking | Higher priority rule wins | unit | `pnpm --filter @floow/core-finance test categorization` | ❌ Wave 0 |
| getOverdueDates() all 6 frequencies | Correct dates for daily/weekly/biweekly/monthly/quarterly/yearly | unit | `pnpm --filter @floow/core-finance test recurring` | ❌ Wave 0 |
| getOverdueDates() month-end edge cases | Jan 31 monthly = Feb 28 (clamp, not overflow) | unit | `pnpm --filter @floow/core-finance test recurring` | ❌ Wave 0 |
| advanceByFrequency() correct advance | Next date correct for each frequency | unit | `pnpm --filter @floow/core-finance test recurring` | ❌ Wave 0 |
| @floow/core-finance builds | No broken exports after adding new modules | automated | `pnpm --filter @floow/core-finance typecheck` | ✅ exists |

### Sampling Rate
- **Per task commit:** `pnpm --filter @floow/core-finance test`
- **Per wave merge:** `pnpm --filter @floow/core-finance test && pnpm --filter @floow/core-finance typecheck`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/core-finance/src/__tests__/categorization.test.ts` — covers matchCategory() with all match types, priority, case-insensitivity, null cases
- [ ] `packages/core-finance/src/__tests__/recurring.test.ts` — covers all 6 frequencies, month-end clamp, multiple overdue dates, empty array for future dates

*(No framework gaps — test infrastructure is fully operational)*

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `packages/core-finance/src/` — 10 existing modules and test files read directly
- Codebase inspection: `supabase/migrations/00001-00005` — RLS pattern, table structure, naming conventions
- Codebase inspection: `packages/core-finance/vitest.config.ts`, `package.json` — exact test commands verified
- Live test run: `pnpm --filter @floow/core-finance test` — 106 tests pass, 465ms

### Secondary (MEDIUM confidence)
- [date-fns v4.0 release blog](https://blog.date-fns.org/v40-with-time-zone-support/) — v4 is ESM/CJS dual, minimal breaking changes, addMonths behavior unchanged
- [date-fns addMonths issue #1596](https://github.com/date-fns/date-fns/issues/1596) — confirmed clamp behavior (last day of month to last day of target month) is deliberate
- [date-fns npm page](https://www.npmjs.com/package/date-fns) — confirmed v4.1.0 available
- [PostgreSQL pg_trgm documentation](https://www.postgresql.org/docs/current/pgtrgm.html) — GIN index with gin_trgm_ops supports ILIKE

### Tertiary (LOW confidence)
- WebSearch: date-fns addMonths month-end issue #3506 — referenced as "last day of month" chain behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — date-fns is locked decision; vitest/TypeScript verified in live codebase; all commands confirmed working
- Architecture: HIGH — directly derived from 5 existing migrations and 10 existing source files
- Pitfalls: HIGH for codebase conventions (live code read); MEDIUM for date-fns edge cases (GitHub issue confirmed, not official docs)
- Test infrastructure: HIGH — ran successfully, 106/106 pass

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (date-fns v4 is stable; Supabase migration patterns are stable)
