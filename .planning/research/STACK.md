# Stack Research

**Domain:** Automatic transaction categorization + recurring transactions in a Next.js / Supabase financial SaaS
**Researched:** 2026-03-18
**Confidence:** HIGH

---

## Context: What Already Exists

The v1.0 stack is fully validated and must not change. This file covers only the additions required for v1.1 features:

| Feature | What it needs that does not exist yet |
|---------|---------------------------------------|
| Automatic categorization | A `category_rules` table + pure function engine to match transaction descriptions against stored rules |
| Recurring transactions | A `recurring_transactions` table + a scheduled job that materializes due transactions daily |

---

## Recommended Stack Additions

### Core: No New Libraries Required

The categorization engine and recurring-transaction logic can be implemented with zero new runtime dependencies — using only what already exists in the monorepo (Drizzle ORM, Zod, plain TypeScript).

| Capability | Implementation | Why |
|------------|----------------|-----|
| Rule matching engine | Pure function in `core-finance` | Fits the established "pure function + thin DB wrapper" pattern; 100% testable with Vitest |
| Description pattern matching | `String.prototype.includes()` (case-insensitive) + optional `RegExp` | Native; no library needed for keyword/substring rules; regex is available when rules need it |
| Date arithmetic for recurrence | `date-fns` v4.1.0 (`addDays`, `addWeeks`, `addMonths`, `addYears`) | Already the ecosystem standard; tree-shakable ESM; pure functions; handles month-end edge cases correctly |
| Scheduled job trigger | Supabase pg_cron (built into hosted Supabase) | Already in the stack infrastructure — zero additional cost or service |
| Rule/template schema columns | Drizzle `jsonb().$type<T>()` | Already using Drizzle; jsonb lets rule conditions evolve without migrations |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` | ^4.1.0 | `addDays`, `addWeeks`, `addMonths`, `addYears` for computing next-due dates from frequency + last-run date | Required by recurring transactions. Add to `@floow/core-finance` (not to the web app directly) |

date-fns v4 is ESM-first, has zero dependencies, and 34M+ weekly downloads. v4.1.0 is the latest stable (released 2024-09-17). It is not currently in the monorepo — this is the one new install.

### Scheduled Job: Supabase pg_cron (No New Service)

The recurring-transaction materializer must run daily without user interaction. Two options exist within the current stack:

**Option A — Supabase pg_cron + Edge Function (recommended)**

pg_cron is already enabled on every hosted Supabase project (version 1.6.4). No provisioning required. A daily cron job calls a Supabase Edge Function (Deno/TypeScript) via HTTP:

```sql
-- Enable once (already available on hosted Supabase)
select cron.schedule(
  'generate-recurring-transactions',
  '0 6 * * *',  -- daily at 06:00 UTC
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/generate-recurring',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'
  )
  $$
);
```

The Edge Function queries all `recurring_transactions` where `next_due_date <= today`, inserts the materialized transaction rows (calling existing `createTransaction` logic), and advances `next_due_date`.

**Option B — Netlify Scheduled Function (fallback)**

Netlify Scheduled Functions are available on all plans and support standard cron syntax in `netlify.toml`. They have a 30-second execution limit (background functions extend this to 15 minutes). However, they introduce an HTTP round-trip to Supabase and require service-role key exposure in Netlify env vars. Use only if Supabase Edge Functions are unavailable.

```toml
# netlify.toml
[functions."generate-recurring-background"]
schedule = "0 6 * * *"
```

**Recommendation: Option A.** pg_cron + Edge Function keeps all scheduling inside Supabase, avoids an extra service dependency, and keeps the service-role key within the Supabase Vault.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest (already installed) | Unit test the rule-matching engine and next-date computation | Pure functions make this trivial — no mocking needed |
| Supabase Dashboard > Integrations > Cron | Visual management and manual "run now" of cron jobs | Use for dev/QA testing before relying on the daily schedule |

---

## Installation

```bash
# Add date-fns to core-finance package only (not to web app)
pnpm --filter @floow/core-finance add date-fns@^4.1.0
```

No other new packages.

---

## Schema Additions Required

These are the two new Drizzle tables needed. No changes to existing tables.

### `category_rules` table

```typescript
// packages/db/src/schema/finance.ts (additions)

export const matchTypeEnum = pgEnum('match_type', ['contains', 'starts_with', 'ends_with', 'regex'])

export const categoryRules = pgTable(
  'category_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
    pattern: text('pattern').notNull(),            // the string to match against description
    matchType: matchTypeEnum('match_type').notNull().default('contains'),
    caseSensitive: boolean('case_sensitive').notNull().default(false),
    priority: integer('priority').notNull().default(0),  // higher = applied first
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxCategoryRulesOrgId: index('idx_category_rules_org_id').on(table.orgId),
    idxCategoryRulesPriority: index('idx_category_rules_priority').on(table.orgId, table.priority),
  })
)
```

Rules are evaluated in descending `priority` order. First match wins. This mirrors how PocketSmith, Copilot Money, and other personal finance tools implement categorization rules.

### `recurring_transactions` table

```typescript
export const recurringFrequencyEnum = pgEnum('recurring_frequency', [
  'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'
])

export const recurringTransactions = pgTable(
  'recurring_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    type: transactionTypeEnum('type').notNull(),
    amountCents: integer('amount_cents').notNull(),
    description: text('description').notNull(),
    frequency: recurringFrequencyEnum('frequency').notNull(),
    startDate: date('start_date', { mode: 'date' }).notNull(),
    endDate: date('end_date', { mode: 'date' }),           // null = no end
    nextDueDate: date('next_due_date', { mode: 'date' }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxRecurringOrgId: index('idx_recurring_transactions_org_id').on(table.orgId),
    idxRecurringNextDue: index('idx_recurring_transactions_next_due').on(table.nextDueDate, table.isActive),
  })
)
```

The `nextDueDate` + `isActive` composite index lets the daily cron fetch only due rows efficiently across all orgs.

---

## Pure Function Signatures (core-finance additions)

### Categorization engine

```typescript
// packages/core-finance/src/categorization.ts

export interface CategoryRule {
  id: string
  categoryId: string
  pattern: string
  matchType: 'contains' | 'starts_with' | 'ends_with' | 'regex'
  caseSensitive: boolean
  priority: number
}

/**
 * Returns the categoryId of the first matching rule, or null if none match.
 * Rules must be pre-sorted descending by priority before calling.
 */
export function applyCategorizationRules(
  description: string,
  rules: CategoryRule[]
): string | null
```

### Recurring date computation

```typescript
// packages/core-finance/src/recurring.ts

import { addDays, addWeeks, addMonths, addYears } from 'date-fns'

export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

/**
 * Returns the next due date after `from` for the given frequency.
 * Pure function — no side effects.
 */
export function computeNextDueDate(from: Date, frequency: RecurringFrequency): Date
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Native string/regex matching in pure function | External rules-engine library (e.g., `json-rules-engine`) | Overkill for keyword matching; adds a dependency; harder to test in isolation |
| Supabase pg_cron + Edge Function | Netlify Scheduled Function | pg_cron keeps scheduling inside Supabase; no extra env vars; service-role key stays in Vault |
| Supabase pg_cron + Edge Function | Vercel Cron / GitHub Actions | Project is on Netlify, not Vercel; GitHub Actions adds a new service for a 5-line cron |
| date-fns v4 for date arithmetic | Temporal API (native) | Temporal is Stage 3 but not yet available in Node.js 22 LTS without polyfill; date-fns is stable and tree-shakable |
| date-fns v4 for date arithmetic | `luxon` | date-fns is tree-shakable and functional; luxon uses OOP with larger bundle; date-fns already the community standard |
| Manual `category_rules` table | ML/AI categorization (e.g., OpenAI API) | Over-engineered for v1.1; user-defined rules are more transparent, offline, cheaper, and sufficient for the target persona (experienced investor who knows their own transactions) |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `json-rules-engine` / `nrules` / any rules-engine library | Adds a dependency for a problem solvable with 30 lines of native TypeScript | Pure function with `String.includes()` + `RegExp` |
| OpenAI / Claude API for categorization | Latency, cost, privacy exposure of financial data, non-deterministic results | Rule-based matching is transparent and user-controllable |
| `node-cron` or `cron` npm package | Cannot run in a serverless/edge environment; requires a persistent process | Supabase pg_cron (or Netlify Scheduled Function) |
| New dedicated microservice for scheduling | Over-engineering; violates current "serverless" constraint | pg_cron inside existing Supabase project |
| `prisma` or additional ORM | Project is committed to Drizzle; mixing ORMs creates schema drift | Continue with Drizzle |
| `dayjs` or `moment` | date-fns is already the recommendation; adding another date lib creates inconsistency | `date-fns` v4 |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `date-fns@^4.1.0` | Node.js 18+, TypeScript 5+, ESM and CJS | v4 is ESM-first; CJS still supported. No breaking changes from v3 for the functions used (`addDays`, `addWeeks`, `addMonths`, `addYears`) |
| `date-fns@^4.1.0` | `drizzle-orm@^0.40.0` | No interaction; they operate in separate layers |
| pg_cron 1.6.4 | Supabase hosted platform | Already enabled on hosted Supabase projects; no action needed to enable |

---

## Integration Points

### Where categorization hooks in

- **On transaction create** (`lib/finance/actions.ts > createTransaction`): after insert, call `applyCategorizationRules(description, orgRules)` and set `categoryId` if a match is found.
- **On OFX/CSV import** (`lib/finance/import-actions.ts`): apply rules during the preview step so imported transactions arrive pre-categorized.
- **Bulk re-categorize action**: server action that re-runs rules against all uncategorized transactions for the org.

### Where recurring generation hooks in

- **Supabase Edge Function** (`supabase/functions/generate-recurring/index.ts`): queries `recurring_transactions WHERE next_due_date <= CURRENT_DATE AND is_active = true`, inserts materialized rows (reusing the balance-update pattern from `createTransaction`), updates `next_due_date` via `computeNextDueDate`.
- **Manual "generate now" action**: server action callable from the UI for testing and catch-up generation.

---

## Sources

- Supabase Cron docs — https://supabase.com/docs/guides/cron — HIGH confidence (official docs, verified 2026-03-18)
- Supabase Cron announcement — https://supabase.com/blog/supabase-cron — HIGH confidence
- Supabase scheduling Edge Functions — https://supabase.com/docs/guides/functions/schedule-functions — HIGH confidence
- Netlify Scheduled Functions — https://docs.netlify.com/build/functions/scheduled-functions/ — HIGH confidence (official docs)
- date-fns CHANGELOG v4.1.0 — https://github.com/date-fns/date-fns/blob/main/CHANGELOG.md — HIGH confidence
- Drizzle ORM custom types — https://orm.drizzle.team/docs/custom-types — HIGH confidence (official docs)
- PocketSmith category rules UX — https://learn.pocketsmith.com/article/156-using-category-rules-to-automatically-categorize-transactions — MEDIUM confidence (product reference)

---

*Stack research for: Floow v1.1 — automatic categorization + recurring transactions*
*Researched: 2026-03-18*
