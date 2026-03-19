# Project Research Summary

**Project:** Floow v1.1 — Automatic Categorization + Recurring Transactions
**Domain:** Financial automation layer on top of a shipped Next.js / Supabase SaaS
**Researched:** 2026-03-18
**Confidence:** HIGH

## Executive Summary

Floow v1.1 adds two well-understood automation features — rule-based transaction categorization and recurring transaction templates — onto an already-shipped v1.0 foundation. Both features are firmly in established territory: every major personal finance app (YNAB, Monarch Money, PocketSmith) uses the same underlying patterns, and the Floow codebase already has all the primitives needed (categories, transactions, import pipeline, Drizzle ORM, Supabase). The net new infrastructure is minimal: two new database tables, one new library (`date-fns`), and a handful of pure functions with UI wrappers. No new services, no new deployment targets, no new authentication concerns.

The recommended approach is a pure-function-first build order: implement the rule-matching and date-arithmetic engines in `core-finance` as pure TypeScript functions, then wire them into server actions, then build UI. This matches the existing codebase architecture exactly and makes the logic trivially testable before any UI exists. Categorization rules apply only when `category_id IS NULL` (never overwriting user intent), and recurring generation is user-triggered in v1.1 (Supabase cron deferred to v2). The single new dependency is `date-fns@^4.1.0` added to `@floow/core-finance`.

The dominant risks are data-integrity issues that are easy to prevent at schema time but expensive to fix after users have data: (1) auto-categorization silently overwriting manually set categories, (2) duplicate recurring transactions from retry/overlap, and (3) non-deterministic rule conflict when two rules match the same description. All three are solved by schema decisions made before the first line of application code: `category_id IS NULL` guard in rule queries, `(recurring_template_id, due_date)` unique constraint with `ON CONFLICT DO NOTHING`, and a `priority` column on rules with deterministic `ORDER BY`. Build these in from day one — retrofitting them after user data exists is costly.

---

## Key Findings

### Recommended Stack

The v1.0 stack is fully locked and does not change. The only meaningful addition for v1.1 is `date-fns@^4.1.0` (ESM-first, zero dependencies, 34M weekly downloads) for recurring date arithmetic in `@floow/core-finance`. Every other capability — rule matching, scheduling, schema evolution — is satisfied by existing stack components.

Supabase `pg_cron` is the correct scheduler for recurring auto-generation when that feature is promoted to v2, because it lives entirely within the existing Supabase project, keeps the `service_role` key in the Vault, and requires no new service. For v1.1, generation is user-triggered and no cron infrastructure is needed at all.

**Core technologies:**
- `date-fns@^4.1.0`: recurring date arithmetic (`addDays`, `addWeeks`, `addMonths`, `addYears`) — only new install; already the ecosystem standard
- `Drizzle ORM` (existing): two new tables (`category_rules`, `recurring_templates`) with `jsonb` for extensible rule conditions
- `Supabase pg_cron` (existing, built-in): daily recurring generation job when promoted to v2
- `Native TypeScript string/RegExp` (no new library): rule pattern matching — 30 lines, fully testable

See `.planning/research/STACK.md` for schema DDL, pure function signatures, and installation command.

### Expected Features

Both feature areas have a clear MVP line. All P1 items are LOW-to-MEDIUM complexity and build directly on existing server action patterns.

**Must have (table stakes):**
- Rule CRUD in Settings (create, reorder by priority, enable/disable, delete) — users of any finance app expect this
- "Create rule from this transaction" shortcut in transaction row actions — reduces friction to near-zero
- Rule applied automatically on import (`importSelectedTransactions`) — core value prop of auto-categorization
- Rule applied on manual transaction creation (`createTransaction`) — ensures consistency across entry paths
- Recurring template CRUD (amount, description, account, category, frequency, start date) — prerequisite for all recurring functionality
- Manual "Generate Now" action per template — equivalent to YNAB's "Enter Now"
- Upcoming recurring list (next 30 days) — necessary for cash flow planning

**Should have (competitive differentiators):**
- Retroactive rule application with impact preview (show count before applying) — saves hours of manual cleanup after large imports; must have confirmation guard
- Amount range condition on rules — prevents false matches on generic Brazilian bank descriptions ("TED", "PIX")
- Auto-suggest rule creation when user manually sets a category (Quicken/Moneydance pattern)
- Import-time summary: "12 transactions auto-categorized" — builds user trust in the automation

**Defer (v2+):**
- Automatic cron-based generation (Supabase Edge Function + pg_cron) — no background job infrastructure needed in v1.1
- AI/ML categorization suggestions — opaque, costly, wrong for the persona
- Automatic subscription detection from transaction patterns — requires statistical analysis, false positives destroy trust
- Cash flow chart projection of future recurring transactions — depends on stable recurring data volume

See `.planning/research/FEATURES.md` for full competitor analysis and prioritization matrix.

### Architecture Approach

The architecture follows the established Floow pattern precisely: pure functions in `@floow/core-finance`, thin DB wrappers in `lib/finance/` server actions, RSC pages that call query functions. Two new server action files (`categorization-actions.ts`, `recurring-actions.ts`) keep the existing `actions.ts` from growing further — the same rationale used to create `import-actions.ts`. Rule management lives under `/categories` (a new tab, no new top-level route). Recurring template management gets its own route at `/transactions/recurring`. Both new tables follow the existing RLS pattern (`org_id IN (SELECT get_user_org_ids())`).

**Major components:**
1. `packages/core-finance/src/categorization.ts` — `matchCategory()` pure function; takes description string + sorted rules array; returns categoryId or null; zero DB dependencies
2. `packages/core-finance/src/recurring.ts` — `getOverdueDates()` and `advanceByFrequency()` pure functions; all date arithmetic; uses `date-fns`
3. `apps/web/lib/finance/categorization-actions.ts` — CRUD for `category_rules` table; bulk re-categorize server action
4. `apps/web/lib/finance/recurring-actions.ts` — CRUD for `recurring_templates`; `generateDueTransactions()` which reuses `createTransaction` balance update logic
5. `supabase/migrations/00006_automation.sql` — DDL for both new tables + RLS policies; all schema guards (unique constraints, indexes) defined here

See `.planning/research/ARCHITECTURE.md` for full file map, data flow diagrams, and build order.

### Critical Pitfalls

1. **Auto-categorization overwrites manual categories** — Rule engine must check `category_id IS NULL` before applying; never overwrite a non-null value. This is a guard in the SQL/Drizzle query, not UI logic. Missing it means users lose manual corrections on every import. Recovery cost: HIGH (no automated fix, users must re-categorize manually).

2. **Duplicate recurring transactions on retry or scheduler overlap** — Add `(recurring_template_id, due_date)` unique constraint to `transactions` and use `ON CONFLICT DO NOTHING` in the generation action. Identical to the import deduplication pattern already in the codebase. Recovery cost: MEDIUM (balance must be corrected).

3. **Non-deterministic rule conflict** — `category_rules` must have a `priority integer NOT NULL DEFAULT 0` column from day one; the match query must `ORDER BY priority DESC`. Without this, two overlapping rules produce different winners depending on insertion order. Recovery cost: MEDIUM (retroactive priority assignment is confusing for users with existing rules).

4. **Category type mismatch on transfer transactions** — Rule matching must include `AND t.type = c.type` (or exclude `type = 'transfer'` entirely). A transfer matched to an expense category breaks cash flow aggregation silently.

5. **ILIKE full table scan at scale** — Add `pg_trgm` GIN index on `transactions.description` in the same migration as the categorization tables. `ILIKE '%pattern%'` without this index triggers sequential scans; breaks at ~5,000 transactions per org.

See `.planning/research/PITFALLS.md` for SQL examples, warning signs, and a full verification checklist.

---

## Implications for Roadmap

Based on the dependency graph in ARCHITECTURE.md (DB schema is foundational, pure functions have no external deps, server actions depend on both, UI depends on actions), and the pitfall-to-phase mapping in PITFALLS.md, a three-phase structure maps cleanly to the two feature domains with a shared foundation phase.

### Phase 1: DB Schema + Pure Functions (Shared Foundation)

**Rationale:** Everything else depends on the two new tables and the pure functions. This phase has no UI and no external dependencies — it can be built and fully tested before any server action or component is written. Doing this first also locks in all schema-level safety guards (unique constraints, priority column, GIN index, RLS policies) before any application code can create bad data.

**Delivers:** `category_rules` table, `recurring_templates` table, migration `00006_automation.sql`, `matchCategory()` function with unit tests, `getOverdueDates()` + `advanceByFrequency()` functions with unit tests, updated `packages/core-finance/src/index.ts` exports.

**Addresses:** Rule CRUD prerequisite, recurring template prerequisite, all schema-level table stakes.

**Avoids:** Non-deterministic rule conflict (priority column + ORDER BY from day one), duplicate recurring transactions (unique constraint from day one), ILIKE performance regression (GIN index from day one), category type mismatch (type guard in match function from day one).

### Phase 2: Categorization Rules — Server Actions + UI

**Rationale:** Categorization is the simpler of the two features (no date arithmetic, no generation logic) and is independently deliverable. Once the pure function exists from Phase 1, wiring it into actions and UI is a contained task. This phase should be validated by users before recurring is built, because categorization rules are a prerequisite for meaningful recurring template categorization.

**Delivers:** `categorization-actions.ts` (createRule, updateRule, deleteRule, bulkRecategorize), `getCategoryRules()` query function, modified `importSelectedTransactions` with rule application, modified `createTransaction` with rule application, `CategoryRuleList` and `CategoryRuleForm` components, rules tab on `/categories` page, "Create rule from this transaction" shortcut.

**Uses:** `matchCategory()` from Phase 1, existing `getOrgId()` + `getDb()` pattern, existing `revalidatePath` cache invalidation.

**Avoids:** Auto-categorization overwriting manual categories (`category_id IS NULL` guard in every rule application path), RLS bypass (org_id filter on all rule queries), service_role exposure.

### Phase 3: Recurring Transactions — Server Actions + UI

**Rationale:** Recurring depends on the same DB foundation as categorization (Phase 1) but is a fully independent feature stream from Phase 2. It carries more complexity (date arithmetic, account validation, idempotency, BRL timezone handling) and benefits from the categorization feature being stable first — recurring templates reference categories, and users are more likely to configure rules before templates.

**Delivers:** `recurring-actions.ts` (createRecurringTemplate, updateRecurringTemplate, deleteRecurringTemplate, generateDueTransactions), `getRecurringTemplates()` query function, `RecurringTemplateList` and `RecurringTemplateForm` components, `/transactions/recurring` page with overdue banner and "Generate Now" action.

**Uses:** `getOverdueDates()` + `advanceByFrequency()` from Phase 1, `date-fns@^4.1.0`, existing `createTransaction` balance update pattern (inlined, not called directly — server actions are not composable).

**Avoids:** Duplicate generation (`ON CONFLICT DO NOTHING` with explicit target), generation against inactive accounts (join `accounts` WHERE `is_active = true` in generation query), BRL timezone off-by-one (anchor all date comparisons to `America/Sao_Paulo`), RLS bypass via service_role (`assertAccountOwnership` before every write).

### Phase 4: Differentiators (Post-Validation)

**Rationale:** These features add polish and competitive advantage but are not required for the core value proposition. They should only be built after Phase 2 and Phase 3 are validated with real users and the edge cases are understood.

**Delivers:** Retroactive rule application with impact preview, amount range condition on rules, import summary ("N transactions auto-categorized"), `category_source` field for auto vs. manual distinction.

**Avoids:** Silent bulk mutation (retroactive application must show affected count before applying — this is the single most dangerous feature if built carelessly).

### Phase Ordering Rationale

- Phase 1 before everything: DB schema and pure functions are zero-dependency; building them first enables parallel work on Phases 2 and 3
- Phase 2 before Phase 3: Categorization is simpler, delivers user value independently, and validates the rule engine before it is depended upon by recurring template generation
- Phase 3 after Phase 1: Recurring can proceed immediately after schema exists; it does not depend on Phase 2 being complete (phases 2 and 3 are parallelizable after Phase 1)
- Phase 4 after validation: Retroactive application is the highest-risk UX feature; it should only be built after Phase 2 rules are confirmed working in production

### Research Flags

Phases with well-documented patterns (skip research-phase — standard implementation):
- **Phase 1:** Pure function TDD + Drizzle schema additions follow exact existing patterns; migration DDL is straightforward
- **Phase 2:** Rule CRUD and import hook follow existing `import-actions.ts` pattern exactly; no novel architecture

Phases that may benefit from deeper research during planning:
- **Phase 3:** BRL timezone handling in date comparisons needs an explicit implementation decision before coding begins; `America/Sao_Paulo` DST transitions (Brazil suspended DST in 2019, but verifying no edge cases in date-fns is warranted)
- **Phase 3:** `generateDueTransactions` must replicate the balance update logic from `createTransaction` without calling the server action — the right extraction point (shared DB helper vs. inlined) needs a decision before implementation
- **Phase 4:** Retroactive application with preview requires careful transaction design (count query before mutation, single server action that does both steps atomically) — worth a focused planning spike

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All additions are zero-surprise: one new library (date-fns, widely validated), existing Supabase/Drizzle/TypeScript stack unchanged. Official docs confirmed. |
| Features | HIGH | Rule-based categorization patterns verified across PocketSmith, Monarch Money, YNAB. Recurring template pattern (nextDueDate + lazy generation) is industry standard. MVP scope is conservative and well-bounded. |
| Architecture | HIGH | Based on direct codebase analysis. Every new component follows an existing pattern in the codebase. No speculative design. |
| Pitfalls | HIGH (core) / MEDIUM (scheduling) | Core pitfalls (overwrite guard, duplicate generation, priority ordering) derived from direct code inspection and established patterns. Scheduling nuances (timezone, pg_cron overlap) from web research — well-sourced but not verified against live Supabase behavior. |

**Overall confidence:** HIGH

### Gaps to Address

- **Balance update extraction:** `createTransaction` contains atomic balance update logic that `generateDueTransactions` must also perform. The right approach — extract to a shared `@floow/db` helper function vs. inline the same logic — is an implementation decision deferred to Phase 3 planning. Either is acceptable; what matters is that the decision is made explicitly before coding to avoid two diverging implementations.

- **`category_source` column:** PITFALLS.md recommends a `category_source: 'auto' | 'manual'` field on transactions to distinguish auto-categorized rows. This is not in the current `transactions` schema. If this is desired for Phase 4 (audit trail, post-import summary), an additional migration will be needed. Should be decided before Phase 2 implementation begins to avoid a schema migration mid-feature.

- **BRL timezone in date-fns:** `date-fns` `addMonths` and similar functions are timezone-agnostic (operate on JS `Date` objects). The BRL timezone guard must be applied at the comparison layer (when checking `nextDueDate <= today`), not inside the pure date arithmetic functions. This needs an explicit test case.

---

## Sources

### Primary (HIGH confidence)
- Supabase Cron docs — https://supabase.com/docs/guides/cron — scheduling, pg_cron behavior
- Supabase Edge Function scheduling — https://supabase.com/docs/guides/functions/schedule-functions — Edge Function + pg_cron pattern
- date-fns CHANGELOG v4.1.0 — https://github.com/date-fns/date-fns/blob/main/CHANGELOG.md — version compatibility
- Drizzle ORM custom types — https://orm.drizzle.team/docs/custom-types — jsonb typing pattern
- pg_trgm documentation — https://www.postgresql.org/docs/current/pgtrgm.html — GIN index for ILIKE
- Direct codebase analysis: `packages/db/src/schema/finance.ts`, `apps/web/lib/finance/actions.ts`, `apps/web/lib/finance/import-actions.ts`, `supabase/migrations/00002_finance.sql`

### Secondary (MEDIUM confidence)
- PocketSmith category rules UX — https://learn.pocketsmith.com/article/156-using-category-rules-to-automatically-categorize-transactions — rule priority and keyword matching UX patterns
- Monarch Money transaction rules — https://help.monarch.com/hc/en-us/articles/360048393372-Creating-Transaction-Rules — conditions + actions model
- YNAB Scheduled Transactions — https://support.ynab.com/en_us/scheduled-transactions-a-guide-BygrAIFA9 — "Enter Now" UX, register-based upcoming view
- GeeksforGeeks: Recurring Payments System Design — https://www.geeksforgeeks.org/system-design-pattern-for-recurring-payments/ — nextDueDate advancement pattern
- Idempotency and Reconciliation in Payment Software — https://www.ijraset.com/research-paper/idempotency-and-reconciliation-in-payment-software — ON CONFLICT DO NOTHING rationale

### Tertiary (informational, not load-bearing)
- Plaid AI-enhanced categorization — https://plaid.com/blog/ai-enhanced-transaction-categorization/ — confirms ML adds ~10-20% accuracy lift; not worth building for v1.1
- Recurring Calendar Events DB Design — https://medium.com/@aureliadotlim/recurring-calendar-events-database-design-dc872fb4f2b5 — confirms lazy generation pattern over eager pre-creation

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
