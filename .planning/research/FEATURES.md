# Feature Research

**Domain:** Automatic transaction categorization + recurring transactions in a personal finance SaaS
**Researched:** 2026-03-18
**Confidence:** HIGH (rule-based categorization), MEDIUM (recurring transaction UX edge cases)

---

## Context: What Already Exists

This is a subsequent milestone on a shipped v1.0 app. The following are already in production and must not be rebuilt:

- `categories` table with `orgId` (nullable = system), `name`, `type`, `color`, `icon`, `isSystem`
- `transactions.categoryId` FK (nullable, `onDelete: set null`)
- Full CRUD for categories via `createCategory`, `updateCategory`, `deleteCategory` server actions
- Full CRUD for transactions including `description` field used for matching
- OFX/CSV import pipeline (`importTransactions`, `importSelectedTransactions`) — no category assignment during import yet
- Filters, pagination, search by `ilike(description)` on transactions list

The new milestone adds automation on top of this existing foundation.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any personal finance app that claims "automatic categorization" or "recurring transactions." Missing these = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Rule creation from existing transaction | Users expect "categorize all transactions like this one" as a one-click workflow from the transaction list | LOW | Most apps offer this; creates rule pre-populated from current description |
| Description contains / exact match | Core match criterion — transaction descriptions from OFX/CSV are raw strings | LOW | "SUPERMERCADO PAO DE ACUCAR" contains "PAO DE ACUCAR" |
| Apply rule to new transactions (prospective) | Rules must fire on import and on manual creation | MEDIUM | Hook into `importSelectedTransactions` and `createTransaction` |
| Rule priority ordering | When two rules match the same transaction, the most specific wins | MEDIUM | Sequential priority list, first match wins (PocketSmith/Monarch pattern) |
| Recurring transaction template | User defines account, category, amount, description, frequency — system generates future transactions | MEDIUM | Template + next_due_date pattern |
| Frequency options: weekly, monthly, yearly | Standard set covering rent, subscriptions, utilities, salaries | LOW | Monthly is by far the most common; daily is rarely needed |
| Manual "generate now" action | Users need to trigger generation on demand, not only on schedule | LOW | Equivalent to YNAB's "Enter Now" |
| List of upcoming recurring transactions | Dashboard or dedicated view showing what's due in the next N days | MEDIUM | Calendar or list view; needed for cash flow planning |
| Pause / stop recurring | User must be able to halt a recurring series without deleting all past transactions | LOW | `isActive` flag on template; past transactions are real rows |

### Differentiators (Competitive Advantage)

Features that go beyond the baseline. Given Floow's positioning as a tool for experienced investors who care about data quality:

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Apply rule retroactively to past transactions | Re-categorizes matching historical transactions in bulk; saves hours of manual cleanup after import | MEDIUM | Opt-in with preview of how many transactions will be affected — critical UX guard |
| Rule created automatically from categorization action | When user manually sets a category on a transaction, offer "always categorize X as Y" — Quicken/Moneydance pattern | LOW | Reduces rule management friction to near-zero |
| Import-time rule application | Rules run during `importSelectedTransactions` so imported transactions arrive already categorized | MEDIUM | Requires fetching active rules in import server action and matching descriptions before insert |
| Amount range condition on rules | Add amount filtering (e.g., "expenses > R$500") to avoid false matches on generic descriptions | MEDIUM | Monarch Money supports this; important for descriptions like "TED" or "PIX" |
| Recurring transaction linked to rule | When a recurring template is created, auto-generate a matching categorization rule | LOW | Convenience, not essential |
| Next-occurrence preview on cash flow | Show projected recurring transactions on the cash flow dashboard in a distinct visual state ("expected") | HIGH | Depends on recurring template table and dashboard integration |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| AI/ML-based categorization | "Smart" auto-categorization sounds impressive | Requires training data per org, model serving infrastructure, opaque results that users can't debug. Floow has no LLM budget or ML infrastructure in v1.1. Rule-based systems achieve 80-90% accuracy for regular users. | Rule-based keyword matching — transparent, deterministic, auditable |
| Automatic subscription detection from patterns | Monarch-style detection without user input | Needs statistical analysis of transaction history, false positives frustrate users, requires significant transaction volume. Wrong detections undermine trust in a financial tool. | User explicitly marks a transaction as recurring; optionally surface suggestions |
| Full RRULE/iCalendar recurrence (e.g., "every 2nd Tuesday of month") | Covers edge cases like variable paydays | Extreme implementation complexity, confusing UI, covers <1% of use cases. Rent, salary, subscriptions are always fixed-day-of-month or weekly. | Fixed set: daily, weekly, biweekly, monthly, quarterly, yearly — covers 99% of cases |
| Retroactive application without preview | "Apply to all past transactions automatically" on rule save | Silent bulk mutation is a critical UX failure for financial data — users cannot undo easily, may regret mass re-categorization | Show count preview + confirmation dialog before applying retroactively |
| Split transactions during auto-categorization | Allocate one transaction to multiple categories automatically | Adds a new data model dimension (transaction splits) that doesn't exist yet and complicates balance calculations | Out of scope for v1.1; rules apply one category per transaction |

---

## Feature Dependencies

```
[Categorization Rules]
    └──requires──> [categories table + CRUD]      ✓ ALREADY EXISTS
    └──requires──> [transactions.description]      ✓ ALREADY EXISTS
    └──enhances──> [Import pipeline]               hooks into importSelectedTransactions
    └──enhances──> [Manual transaction creation]   hooks into createTransaction

[Recurring Transactions]
    └──requires──> [accounts table]                ✓ ALREADY EXISTS
    └──requires──> [categories table]              ✓ ALREADY EXISTS
    └──requires──> [createTransaction server action] reuse for generation
    └──enhances──> [Cash flow dashboard]           projected transactions view

[Retroactive Rule Application]
    └──requires──> [Categorization Rules]          rules must exist first
    └──requires──> [transactions table with description] ✓ ALREADY EXISTS
    └──conflicts──> [Retroactive without preview]  must show impact before applying

[Import-time Rule Application]
    └──requires──> [Categorization Rules]          rules must exist first
    └──requires──> [importSelectedTransactions action] inject rule lookup here
```

### Dependency Notes

- **Rules require categories to exist:** Categories are already live. Rules reference `categories.id` as their output action. No new dependency to satisfy.
- **Recurring templates require createTransaction:** Generated recurring transactions should reuse the existing `createTransaction` logic (balance update, org ownership) — do not duplicate it.
- **Retroactive application conflicts with silent mutation:** The retroactive feature is a differentiator only if it has a preview guard. Without it, it becomes the most dangerous anti-feature.
- **Import-time application depends on rules:** Must load org's active rules inside `importSelectedTransactions` before inserting rows.

---

## MVP Definition

### Launch With (v1.1 — this milestone)

These features constitute the minimum that makes both "automatic categorization" and "recurring transactions" feel real and useful:

- [ ] `categorization_rules` table: `orgId`, `name`, `matchType` (contains/exact), `matchValue`, `categoryId`, `priority`, `isActive`
- [ ] Rule CRUD UI in Settings (create, reorder, enable/disable, delete)
- [ ] "Create rule from this transaction" shortcut in transaction row actions
- [ ] Rule application hook in `importSelectedTransactions` (prospective, on import)
- [ ] Rule application hook in `createTransaction` (prospective, on manual entry)
- [ ] `recurring_templates` table: `orgId`, `accountId`, `categoryId`, `type`, `amountCents`, `description`, `frequency` (enum), `startDate`, `nextDueDate`, `isActive`
- [ ] Recurring template CRUD UI
- [ ] Manual "generate now" action that creates the transaction and advances `nextDueDate`
- [ ] Upcoming recurring list (next 30 days) on a dedicated page or sidebar widget

### Add After Validation (v1.x)

- [ ] Retroactive rule application — add after users have rules running and ask for history cleanup
- [ ] Amount range condition on rules — add when users report false positives on generic descriptions
- [ ] Next-occurrence projection on cash flow chart — add when recurring templates have stable data

### Future Consideration (v2+)

- [ ] Automatic generation via cron (Supabase Edge Function scheduled job) — defer until user base justifies server-side scheduling infrastructure
- [ ] AI-assisted rule suggestions based on description patterns — defer until LLM integration is justified
- [ ] Automatic subscription detection from transaction history

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Rule CRUD + description match | HIGH | LOW | P1 |
| Rule applied on import | HIGH | LOW | P1 |
| Rule applied on manual create | HIGH | LOW | P1 |
| "Create rule from transaction" shortcut | HIGH | LOW | P1 |
| Recurring template CRUD | HIGH | MEDIUM | P1 |
| Manual "generate now" | HIGH | LOW | P1 |
| Upcoming recurring list | HIGH | LOW | P1 |
| Retroactive rule application | MEDIUM | MEDIUM | P2 |
| Amount range condition on rules | MEDIUM | LOW | P2 |
| Cash flow projection for recurring | MEDIUM | HIGH | P3 |
| Auto-generation via cron job | LOW | HIGH | P3 |

---

## Competitor Feature Analysis

| Feature | YNAB | Monarch Money | PocketSmith | Our Approach |
|---------|------|---------------|-------------|--------------|
| Rule conditions | None (manual only) | Merchant, amount, category | Merchant keyword only | Description contains/exact + amount range (v1.2) |
| Rule actions | N/A | Rename, recategorize, tag, hide | Assign category | Assign category (primary action for Floow) |
| Retroactive application | No | Yes (optional on rule save) | Yes (batch re-run) | Yes, opt-in with impact preview |
| Recurring transactions | Scheduled transactions with "Enter Now" | Detection from history + manual | Manual templates | Manual templates with "Generate Now" |
| Recurrence frequencies | 13 options including "twice a month" | Detected from history | Weekly/monthly/yearly | daily, weekly, biweekly, monthly, quarterly, yearly |
| Auto-generation | Yes (appears in register) | Synced from bank | Manual only | Manual for v1.1; cron for v2 |
| Upcoming view | Register view shows scheduled | Calendar + list view | Monthly calendar | List view (next 30 days) for v1.1 |

---

## Key Design Decisions for Implementation

### Categorization Rules

**Rule match priority:** Sequential priority list, first match wins. User can reorder via drag-and-drop or up/down buttons. Most specific rules at top (exact match > contains match).

**Rule trigger points:** Two insertion paths must both apply rules:
1. `importSelectedTransactions` — fetch active rules once, apply to all rows before insert
2. `createTransaction` — apply rules after Zod validation, before DB insert (only if no categoryId was provided by user)

**Rule should NOT override explicit user choice:** If the user picks a category in the form, the rule engine is bypassed. Rules apply only when `categoryId` is null/unset.

### Recurring Transactions

**Schema pattern:** `recurring_templates` table stores the template. Each generation creates a real row in `transactions` and advances `nextDueDate`. This keeps the transaction ledger clean and queryable with no special cases.

**nextDueDate advancement logic:** Pure function in `core-finance` package. Input: current `nextDueDate` + `frequency` enum. Output: next date. Handles month-end edge cases (e.g., monthly from Jan 31 → Feb 28, not Feb 31).

**No auto-generation in v1.1:** Generation is user-triggered ("Generate Now" button). Supabase cron is v2. This avoids background job infrastructure and keeps v1.1 scope contained.

**Deletion behavior:** Deleting a template stops future generation. Already-generated transactions are real `transactions` rows and are unaffected — consistent with Sage Intacct and QuickBooks patterns.

---

## Sources

- [PocketSmith: Using Category Rules](https://learn.pocketsmith.com/article/156-using-category-rules-to-automatically-categorize-transactions) — rule priority and keyword matching patterns
- [Monarch Money: Creating Transaction Rules](https://help.monarch.com/hc/en-us/articles/360048393372-Creating-Transaction-Rules) — conditions (merchant, amount), actions (rename, recategorize, tag, hide)
- [Monarch Money: Tracking Recurring Expenses](https://www.monarch.com/blog/track-recurring-bills-and-subscriptions) — detection model and calendar view
- [Thoughtbot: Recurring Events in PostgreSQL](https://thoughtbot.com/blog/recurring-events-and-postgresql) — interval-based schema and recursive CTE generation
- [Copilot: Editing Recurrings](https://help.copilot.money/en/articles/3783837-editing-recurrings) — "apply to future only vs. include past" UX pattern
- [GeeksforGeeks: System Design for Recurring Payments](https://www.geeksforgeeks.org/system-design-pattern-for-recurring-payments/) — nextDueDate advancement pattern
- [YNAB Scheduled Transactions](https://support.ynab.com/en_us/scheduled-transactions-a-guide-BygrAIFA9) — "Enter Now" UX, register-based upcoming view
- [Plaid: AI-enhanced transaction categorization](https://plaid.com/blog/ai-enhanced-transaction-categorization/) — industry accuracy benchmarks (10-20% improvement with ML — not worth building for v1.1)
- [Quicken community: Retroactive categorization](https://community.quicken.com/discussion/7897879/automatically-categorize-past-future-transactions) — Find & Replace pattern as alternative to rule retroactivity

---

*Feature research for: Floow v1.1 — Automatic Categorization + Recurring Transactions*
*Researched: 2026-03-18*
