# Pitfalls Research

**Domain:** Automatic transaction categorization and recurring transactions in a multi-tenant financial SaaS
**Researched:** 2026-03-18
**Confidence:** HIGH (core patterns derived from codebase analysis + MEDIUM for scheduling nuances from web research)

---

## Critical Pitfalls

### Pitfall 1: Auto-categorization overwrites user-corrected categories

**What goes wrong:**
A categorization rule fires on every transaction insert or on every import, including transactions the user already manually categorized. The user sets "Netflix" to "Entertainment" — on the next import the rule matches the description and resets it to "Assinaturas". The user loses their correction silently.

**Why it happens:**
The rule engine is wired to the insert path without a guard for existing `category_id`. Developers think "auto-categorize everything" and don't model the distinction between an uncategorized transaction (eligible) and one the user has touched (protected).

**How to avoid:**
Rules must only apply when `category_id IS NULL`. Add a boolean column `category_manually_set` (or rely on `category_id IS NULL` as the trigger condition). The rule engine must never overwrite a non-null `category_id` unless the user explicitly requests a bulk-re-categorize.

```sql
-- Only apply rule when no category is set
UPDATE transactions
SET category_id = $rule_category_id
WHERE org_id = $org_id
  AND category_id IS NULL
  AND description ILIKE $pattern;
```

**Warning signs:**
- Users report categories "resetting" after imports
- `category_id` is being set even when a value already exists in the rule application query

**Phase to address:** Phase 1 (Categorization Rules) — build the guard into the core rule-application function from day one.

---

### Pitfall 2: ILIKE pattern matching causes full table scans at scale

**What goes wrong:**
Rules use `WHERE description ILIKE '%mercadopago%'` without an index. With 10k+ transactions per org, applying all rules on import triggers a sequential scan per rule per org, causing timeouts on large imports.

**Why it happens:**
`ILIKE '%pattern%'` (leading wildcard) cannot use a B-tree index — the index is simply skipped. This works fine with 500 transactions in dev/staging but degrades badly in production.

**How to avoid:**
Install the `pg_trgm` extension (already available in Supabase) and create a GIN trigram index on `transactions.description`:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_transactions_description_trgm
  ON public.transactions USING GIN (description gin_trgm_ops);
```

With this index, `ILIKE '%pattern%'` becomes index-backed. Alternatively, apply rules in-process (Node.js) after fetching uncategorized transactions, which trades a single query for no DDL change.

**Warning signs:**
- Import server action becomes noticeably slower as transaction count grows
- `EXPLAIN ANALYZE` shows `Seq Scan` on `transactions` when rules fire
- Supabase slow query log shows `description ILIKE` queries above 100ms

**Phase to address:** Phase 1 (Categorization Rules) — add the GIN index in the migration that creates the `categorization_rules` table, before any rule-matching query is written.

---

### Pitfall 3: Recurring transaction generation creates duplicates on retry or scheduler overlap

**What goes wrong:**
The scheduled job that generates due recurring transactions runs twice (restart, retry, manual trigger, or `pg_cron` overlap during a slow run). Each run inserts the same transaction for the same recurring template and same due date, producing duplicate entries and double-debiting account balances.

**Why it happens:**
The generation job does a simple `INSERT` without checking whether a transaction for that template+period already exists. Since the job is idempotent in intent but not in implementation, any re-execution creates duplicates.

**How to avoid:**
Add a `(recurring_template_id, due_date)` unique constraint on the `transactions` table (or on a separate `recurring_occurrences` tracking table). Use `INSERT ... ON CONFLICT DO NOTHING` for generation, identical to the import deduplication pattern already established in the codebase:

```sql
-- Existing pattern in the codebase — apply to recurring generation
INSERT INTO transactions (...)
VALUES (...)
ON CONFLICT (recurring_template_id, due_date) DO NOTHING;
```

Alternatively, use a separate `recurring_occurrences` table that tracks `(template_id, due_date)` with a unique constraint and serves as the idempotency gate.

**Warning signs:**
- Duplicate transactions appearing for the same payee/date in the same account
- Account balance drifting incorrect after scheduler runs
- Two entries with identical `description`, `date`, and `amount_cents` under the same account

**Phase to address:** Phase 2 (Recurring Transactions) — the unique constraint and `ON CONFLICT DO NOTHING` must be in the schema migration, not added later as a fix.

---

### Pitfall 4: Recurring transactions generate against inactive or deleted accounts

**What goes wrong:**
An account is soft-deleted (`is_active = false`) or the user closes it. The recurring template still has `account_id` pointing to it. The scheduler generates new transactions against a deactivated account, polluting reports and confusing balances.

**Why it happens:**
The generation job queries `recurring_templates` directly without joining to `accounts` to verify `is_active = true`. The template-to-account relationship is not validated at generation time.

**How to avoid:**
The generation query must join `accounts` and filter `is_active = true`:

```sql
SELECT rt.*
FROM recurring_templates rt
JOIN accounts a ON a.id = rt.account_id
WHERE a.is_active = true
  AND rt.next_due_date <= CURRENT_DATE
  AND (rt.end_date IS NULL OR rt.end_date >= CURRENT_DATE)
  AND (rt.max_occurrences IS NULL OR rt.occurrences_count < rt.max_occurrences);
```

Also: when `deleteAccount` runs (soft-delete), update or pause any templates associated with that account.

**Warning signs:**
- Transactions appear under accounts marked `is_active = false`
- Balance discrepancies on closed accounts

**Phase to address:** Phase 2 (Recurring Transactions) — validate `is_active` check in generation query from the start.

---

### Pitfall 5: Timezone-naive recurring schedule causes off-by-one-day errors in Brazil

**What goes wrong:**
A "monthly on the 5th" recurring transaction is scheduled using UTC dates. In BRL timezone (America/Sao_Paulo, UTC-3), a UTC midnight of the 5th is actually late evening on the 4th in São Paulo. The transaction either fires one day early or the user sees it listed on the wrong date.

**Why it happens:**
The `transactions.date` column uses PostgreSQL `date` type (no timezone) which is correct for display, but the comparison `due_date <= CURRENT_DATE` in a UTC-running `pg_cron` job evaluates `CURRENT_DATE` in UTC, not in the user's local timezone.

**How to avoid:**
Use `CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo'` in the generation query, or schedule generation to run at a time guaranteed to be in the same civil day in BRL. Since the app targets Brazilian investors (BRL), always anchor date comparisons to `America/Sao_Paulo`. Store `next_due_date` as a `date` (no timezone) computed entirely in the BRL calendar — never derived from UTC timestamps.

**Warning signs:**
- Transactions dated the 5th appear on the 4th in the transaction list
- User reports "my salary transaction always shows up one day early"
- Tests pass locally (developer TZ) but fail in CI (UTC)

**Phase to address:** Phase 2 (Recurring Transactions) — document the BRL-timezone assumption in the scheduler design and add a test with explicit timezone assertions.

---

### Pitfall 6: Rule conflict produces non-deterministic categorization when multiple rules match

**What goes wrong:**
Two rules both match the same transaction description — "UBER*EATS" matches both a "Transporte" rule and an "Alimentacao" rule. Without a defined priority ordering, the category applied depends on insertion order, query plan, or race condition in the rule engine. Users see inconsistent categorization across similar transactions.

**Why it happens:**
The rules table has no `priority` column and the application queries all rules without an `ORDER BY`. The first matching rule wins by accident.

**How to avoid:**
Add a `priority integer NOT NULL DEFAULT 0` column to `categorization_rules`. The matching query must `ORDER BY priority DESC` and apply only the first match. Document the priority convention: higher number = evaluated first. Let users reorder rules in the UI.

```sql
SELECT * FROM categorization_rules
WHERE org_id = $org_id
ORDER BY priority DESC, created_at ASC;
```

**Warning signs:**
- Same description categorizes differently on different imports
- Users report "some Netflix transactions go to Assinaturas, others to Lazer"
- Rules table has no ordering column

**Phase to address:** Phase 1 (Categorization Rules) — include `priority` in the initial schema; retrofitting priority ordering after rules are created is disruptive.

---

### Pitfall 7: RLS not applied to cron-generated rows — service_role key bypasses tenant isolation

**What goes wrong:**
The recurring transaction generation job uses the Supabase `service_role` key (needed to bypass RLS for cross-tenant batch jobs). A bug in the generation query — missing `WHERE org_id = $org_id` filter — inserts a transaction into the wrong tenant's account. RLS does not protect against this because `service_role` bypasses all policies.

**Why it happens:**
Developers trust RLS as the sole isolation guard. When operating with `service_role`, RLS is silently bypassed. A missing `org_id` filter or wrong variable binding goes undetected until a tenant notices foreign transactions.

**How to avoid:**
Every write in the generation job must explicitly include `org_id` in both `INSERT` values and `WHERE` clauses — never rely on RLS as the safety net for service-role operations. Add an application-level assertion before any write: confirm the `account_id` belongs to the expected `org_id`:

```typescript
// Same assertAccountOwnership pattern already in actions.ts
await assertAccountOwnership(db, template.accountId, template.orgId)
```

Run the generation job through a per-org loop so any misconfiguration is scoped to one org, not all orgs.

**Warning signs:**
- Transactions appear under accounts of a different organization
- Supabase audit logs show `service_role` writes without `org_id` in the filter clause

**Phase to address:** Phase 2 (Recurring Transactions) — enforce `assertAccountOwnership` pattern in the generation service before any insert.

---

### Pitfall 8: Applying categorization rules to transferred transactions causes category type mismatch

**What goes wrong:**
The rule engine applies description-based rules to transfer transactions (`type = 'transfer'`). Categories have a `type` field that must match the transaction type (a transfer cannot use an `expense` category). The mismatch silently stores an invalid `category_id`, breaking cash flow aggregation that filters by category type.

**Why it happens:**
The rule engine applies rules based solely on description pattern, ignoring transaction type. The category constraint is only enforced in the UI, not at the data layer.

**How to avoid:**
The rule-matching query must include a `type` guard — only apply a rule if the transaction type matches the category type:

```sql
UPDATE transactions t
SET category_id = cr.category_id
FROM categorization_rules cr
JOIN categories c ON c.id = cr.category_id
WHERE t.org_id = cr.org_id
  AND t.category_id IS NULL
  AND t.description ILIKE cr.pattern
  AND t.type = c.type;   -- type must match
```

Alternatively, exclude `transfer` transactions from auto-categorization entirely (transfers rarely benefit from categorization).

**Warning signs:**
- Cash flow charts show transfers in expense/income categories
- Category filter returns unexpected transaction types

**Phase to address:** Phase 1 (Categorization Rules) — add `AND t.type = c.type` to the match query from the start.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Apply rules only on demand (manual "re-categorize" button), not on every insert | Simpler to ship | Categories not applied on import unless user triggers it; user experience is confusing | MVP only — add trigger-on-insert in Phase 1 post-MVP if UX complaints arise |
| Store recurring schedule as a text cron expression only | Flexible | Hard to compute `next_due_date` in SQL; forces app-layer calculation on every scheduler run | Never — store explicit `next_due_date` date column, update after each generation |
| No `priority` column on rules — first rule wins | Faster to build | Non-deterministic categorization as rule set grows | Never — add priority from day one |
| Generate recurring transactions eagerly (all future occurrences at template creation) | Simple query for listing | Huge row explosion; editing template requires deleting/recreating hundreds of rows | Never — generate on demand (lazy generation up to N days ahead) |
| Use ILIKE without pg_trgm index | Zero migration work | Full table scan on every rule application; breaks at 5k+ transactions | Acceptable only for orgs with < 1000 transactions — add index before first prod user |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase pg_cron + Edge Function | Using `anon` key in the HTTP call from pg_cron — Edge Function inherits no user session, RLS blocks all reads/writes | Call Edge Function with `service_role` key stored in Supabase Vault; handle `org_id` filtering entirely in application code |
| Supabase pg_cron concurrent runs | Assuming pg_cron never overlaps — it queues a second run if the first is still running, meaning two runs can execute close together during slow generation | Use `ON CONFLICT DO NOTHING` as idempotency guard; pg_cron does not run concurrent instances of the same job but the next scheduled run starts immediately after |
| Drizzle ORM + `ON CONFLICT DO NOTHING` for recurring | `onConflictDoNothing()` with no `target` silently ignores ALL conflicts including constraint violations unrelated to deduplication | Always specify `target: [transactions.recurringTemplateId, transactions.dueDate]` explicitly — as done in `importSelectedTransactions` |
| `revalidatePath` after recurring generation | Forgetting to revalidate `/transactions` and `/accounts` after the scheduler generates new rows — user's page shows stale data | Always call `revalidatePath('/transactions')` and `revalidatePath('/accounts')` after any write that modifies balances |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| ILIKE without pg_trgm index in rule matching | Import server action timeouts; slow query log entries | Create GIN trigram index on `transactions.description` | ~5,000 transactions per org with 3+ rules |
| Applying all rules to all uncategorized transactions on every import | O(rules × uncategorized_transactions) per import | Apply rules only to newly inserted transactions (filter by `imported_at >= $now - interval '5 seconds'` or track which were just inserted via RETURNING) | 10+ rules, 50+ uncategorized rows per import |
| Generating all future recurring occurrences eagerly | Query for "upcoming transactions" returns thousands of rows | Generate only transactions due within the next 30 days; use `next_due_date` column to advance schedule lazily | Template with monthly frequency and no end date — infinite rows |
| Per-rule scan at categorization time without org filter in index | Full scan even with trgm index because `org_id` condition prevents index use | Include `org_id` in the WHERE clause; the trgm index is used for the text part, org filter is applied on top | Any multi-tenant scale |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `service_role` key used in client-side code to trigger recurring generation | Any user can read the key from browser DevTools and bypass RLS entirely | `service_role` key must only exist in server-side code (server actions, Edge Functions called server-side); never in client components |
| Categorization rule pattern not sanitized before ILIKE — SQL injection via pattern | User-provided pattern could escape ILIKE and inject SQL | Use parameterized queries (Drizzle always parameterizes); never interpolate user input directly into SQL strings |
| Rules shared between orgs by mistake — missing `org_id` filter on rule lookup | Org A's rules apply to Org B's transactions | Every rule query must include `WHERE org_id = $orgId`; add DB-level RLS policy on `categorization_rules` matching the existing pattern |
| Recurring template `account_id` not re-validated on each generation run | If account ownership changes or the account is transferred (future multi-user feature), a stale template generates transactions in the wrong context | Run `assertAccountOwnership` at generation time, not just at template creation |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No indication that a category was auto-applied vs. manually set | User cannot tell which categories need review; auto-errors go unnoticed | Store `category_source: 'auto' | 'manual'` on the transaction (or infer from `category_manually_set` boolean); show a small "auto" badge in the UI |
| Rule matching uses exact case-sensitive match | "MERCADO PAGO" matches but "Mercado Pago" does not | Always use ILIKE (case-insensitive); normalize imported descriptions to uppercase on insert |
| Recurring transaction created but user sees no confirmation of when the next one will fire | User re-enters the transaction manually, creating a duplicate | Always show `next_due_date` on the template card; show "next on: 2026-04-05" clearly |
| Auto-categorization runs silently and user has no way to review what was changed | Trust erosion — user cannot audit what the system did | Show a summary after import: "12 transactions auto-categorized" with a link to filter `category_source = 'auto'` |
| Deleting a category that has an active categorization rule | Rule still fires but inserts a null category because the FK was set null on delete | When a category is deleted, cascade-delete or disable any rules that reference it; warn the user in the delete dialog |

---

## "Looks Done But Isn't" Checklist

- [ ] **Categorization rules:** Rule application query includes `AND category_id IS NULL` — verify rules never overwrite manual categories
- [ ] **Categorization rules:** `AND t.type = c.type` guard is in the match query — verify transfer transactions are excluded or only matched to transfer categories
- [ ] **Rule priority:** `categorization_rules` table has a `priority` column and the match query uses `ORDER BY priority DESC` — verify deterministic behavior with two overlapping rules
- [ ] **Recurring generation — idempotency:** `(recurring_template_id, due_date)` unique constraint exists and generation uses `ON CONFLICT DO NOTHING` — verify by running generation twice on the same date
- [ ] **Recurring generation — inactive accounts:** Generation query joins `accounts` and filters `is_active = true` — verify by deactivating an account and confirming no new transactions are created
- [ ] **Recurring generation — balance update:** After generating transactions, `balance_cents` on the account is updated atomically using `sql\`balance_cents + ${delta}\`` — verify balance is correct after first scheduled run
- [ ] **RLS on new tables:** `categorization_rules` and `recurring_templates` tables have RLS enabled with `org_id IN (SELECT get_user_org_ids())` policies — verify a request with a different org's JWT cannot read or write
- [ ] **Timezone:** Recurring due date comparison uses `America/Sao_Paulo` as the reference timezone, not UTC — verify a "monthly on the 1st" template fires on the 1st in São Paulo local time
- [ ] **Cascades:** Deleting a category disables/deletes any rules referencing it — verify no orphan rules remain after category deletion

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Auto-categorization overwrote manual categories | HIGH | No automated recovery — requires user to manually review and re-categorize affected transactions; add `category_source` column retroactively to distinguish; prevent recurrence by adding `IS NULL` guard |
| Duplicate recurring transactions created | MEDIUM | Query for pairs with identical `(recurring_template_id, due_date, account_id)` or `(description, date, amount_cents, account_id)` with `COUNT > 1`; delete extras; reverse duplicate balance impacts |
| Wrong-org transaction inserted by service_role bug | HIGH | Identify affected rows by querying for transactions where account's `org_id` does not match transaction's `org_id`; delete and re-create in correct org; audit all service-role writes in Supabase logs |
| ILIKE performance regression (missing index) | LOW | `CREATE INDEX CONCURRENTLY` — can be done without downtime in Supabase; query performance recovers immediately after index build completes |
| Non-deterministic rule conflict | MEDIUM | Add `priority` column with `ALTER TABLE ... ADD COLUMN priority integer NOT NULL DEFAULT 0`; update existing rules; add `ORDER BY priority DESC` to rule query — no data loss, just ordering fix |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Auto-categorization overwrites manual categories | Phase 1: Categorization Rules | Test: create rule, manually categorize transaction, run rule engine, verify category unchanged |
| ILIKE full table scan | Phase 1: Categorization Rules | Test: EXPLAIN ANALYZE shows index scan on `description` column |
| Rule conflict — non-deterministic | Phase 1: Categorization Rules | Test: two overlapping rules applied to same transaction — deterministic winner every time |
| Transfer type mismatch | Phase 1: Categorization Rules | Test: transfer transaction is not matched to income/expense category rule |
| Duplicate recurring transactions | Phase 2: Recurring Transactions | Test: run generation twice, assert count unchanged |
| Generation against inactive accounts | Phase 2: Recurring Transactions | Test: soft-delete account, run generation, assert no new transactions |
| Timezone off-by-one | Phase 2: Recurring Transactions | Test: assert `next_due_date` computed in `America/Sao_Paulo` timezone |
| RLS bypass with service_role | Phase 2: Recurring Transactions | Test: insert with service_role missing `org_id`, assert ownership assertion throws |
| Balance double-update on duplicate generation | Phase 2: Recurring Transactions | Test: run generation twice, assert account `balance_cents` unchanged on second run |

---

## Sources

- Codebase analysis: `packages/db/src/schema/finance.ts`, `apps/web/lib/finance/actions.ts`, `apps/web/lib/finance/import-actions.ts`, `supabase/migrations/00002_finance.sql` — HIGH confidence (direct code inspection)
- [What Is Automatic Transaction Categorization & How It Works](https://www.docuclipper.com/blog/automatic-transaction-categorization/) — 31% miscategorization rate figure, pattern matching failures
- [Bank transaction categorisation: keeping up with the ever-moving goalposts](https://www.atto.co/blog/bank-transaction-categorisation-keeping-up-with-the-ever-moving-goalposts) — merchant identification as moving target
- [Supabase Cron | Schedule Recurring Jobs in Postgres](https://supabase.com/modules/cron) — 8 concurrent job limit, pg_cron scheduling
- [pg_cron: Schedule Recurring Jobs with Cron Syntax in Postgres | Supabase Docs](https://supabase.com/docs/guides/database/extensions/pg_cron) — Supabase pg_cron behavior
- [PostgreSQL Fuzzy Searches vs. Regex Matches: A Performance Comparison](https://www.alibabacloud.com/blog/postgresql-fuzzy-searches-vs--regex-matches-a-performance-comparison_595636) — ILIKE performance and indexing
- [pg_trgm — support for similarity of text using trigram matching](https://www.postgresql.org/docs/current/pgtrgm.html) — GIN index for ILIKE
- [How the Service Role Key Bypasses RLS | Supabase](https://egghead.io/lessons/supabase-use-the-supabase-service-key-to-bypass-row-level-security) — service_role RLS bypass behavior
- [How to Handle Date and Time Correctly to Avoid Timezone Bugs](https://dev.to/kcsujeet/how-to-handle-date-and-time-correctly-to-avoid-timezone-bugs-4o03) — timezone pitfalls in scheduling
- [Recurring Calendar Events — Database Design](https://medium.com/@aureliadotlim/recurring-calendar-events-database-design-dc872fb4f2b5) — lazy generation pattern vs. eager pre-creation
- [Idempotency and Reconciliation in Payment Software](https://www.ijraset.com/research-paper/idempotency-and-reconciliation-in-payment-software) — idempotency keys for duplicate prevention

---
*Pitfalls research for: Automatic transaction categorization and recurring transactions (v1.1) — Floow financial SaaS*
*Researched: 2026-03-18*
