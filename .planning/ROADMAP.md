# Roadmap: Floow

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-18)
- 🚧 **v1.1 Automação** — Phases 5-7 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-18</summary>

- [x] Phase 1: Platform Foundation (5/5 plans) — completed 2026-03-10
- [x] Phase 2: Finance Engine (4/4 plans) — completed 2026-03-11
- [x] Phase 3: Investments Engine (4/4 plans) — completed 2026-03-17
- [x] Phase 4: Planning Engine (3/3 plans) — completed 2026-03-18

</details>

### 🚧 v1.1 Automação (In Progress)

**Milestone Goal:** Automatizar tarefas repetitivas — categorização inteligente de transações por regras e transações recorrentes programadas com geração sob demanda.

- [ ] **Phase 5: Automation Foundation** - DB schema migrations, pure functions, and unit tests for both automation features
- [ ] **Phase 6: Categorization Rules** - Complete CRUD, auto-apply on import and manual creation, rule-from-transaction shortcut, and retroactive application with preview
- [ ] **Phase 7: Recurring Transactions** - Complete CRUD, upcoming-due list, manual generation, and pause/reactivation

## Phase Details

### Phase 5: Automation Foundation
**Goal**: The schema and pure logic for both automation features exist, are tested, and are safe to build on
**Depends on**: Phase 4 (v1.0 complete)
**Requirements**: (none — infrastructure phase; all v1.1 requirements are delivered in Phases 6 and 7)
**Success Criteria** (what must be TRUE):
  1. Migration `00006_automation.sql` runs cleanly on a fresh Supabase project with both tables created, RLS policies active, priority column, unique constraints, and GIN index
  2. `matchCategory()` pure function returns the correct category ID for matching rules and null when no rule matches, with priority tie-breaking verified by unit tests
  3. `getOverdueDates()` and `advanceByFrequency()` pure functions produce correct dates for all 6 frequencies (daily, weekly, biweekly, monthly, quarterly, yearly) including month-end edge cases, verified by unit tests
  4. `@floow/core-finance` builds and exports all new functions without breaking existing exports
**Plans**: TBD

Plans:
- [ ] 05-01: DB migration + pure functions (schema DDL for category_rules and recurring_templates, matchCategory, getOverdueDates, advanceByFrequency)

### Phase 6: Categorization Rules
**Goal**: Users can define rules that automatically assign categories to transactions, reducing manual categorization work
**Depends on**: Phase 5
**Requirements**: CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-06
**Success Criteria** (what must be TRUE):
  1. User can create a categorization rule with match type (contains/exact), match value, target category, and priority — and the rule appears immediately in the rules list
  2. User can edit, reorder, enable/disable, and delete rules from the settings page
  3. Transactions imported via OFX/CSV are automatically assigned the matching category when no category was previously set — manually categorized transactions are never overwritten
  4. Transactions created manually are automatically assigned a category when no category is explicitly chosen
  5. User can click "Categorizar todas como esta" on an existing transaction to open a pre-populated rule form
  6. User can apply a rule retroactively, sees "X transactions will be affected" before confirming, and only uncategorized transactions are changed
**Plans**: TBD

Plans:
- [ ] 06-01: Server actions + DB queries (createRule, updateRule, deleteRule, reorderRules, bulkRecategorize, import hook, createTransaction hook)
- [ ] 06-02: UI — rules management tab on /categories and transaction row "create rule" shortcut

### Phase 7: Recurring Transactions
**Goal**: Users can define recurring transaction templates and generate transactions on demand, eliminating repetitive manual entry for predictable expenses and income
**Depends on**: Phase 5
**Requirements**: REC-01, REC-02, REC-03, REC-04, REC-05
**Success Criteria** (what must be TRUE):
  1. User can create a recurring template with account, category, type, amount, description, frequency, and start date — template appears in the recurring list immediately
  2. User can edit and delete recurring templates
  3. User can click "Gerar agora" on a template, which creates the transaction and advances the next due date — clicking twice does not create a duplicate
  4. User can view a list of all recurring transactions due in the next 30 days from the /transactions/recurring page
  5. User can pause a recurring template and reactivate it later without losing previously generated transaction history
**Plans**: TBD

Plans:
- [ ] 07-01: Server actions + DB queries (createRecurringTemplate, updateRecurringTemplate, deleteRecurringTemplate, generateDueTransactions, pauseTemplate, reactivateTemplate)
- [ ] 07-02: UI — /transactions/recurring page with template list, upcoming-due section, and generate/pause actions

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Platform Foundation | v1.0 | 5/5 | Complete | 2026-03-10 |
| 2. Finance Engine | v1.0 | 4/4 | Complete | 2026-03-11 |
| 3. Investments Engine | v1.0 | 4/4 | Complete | 2026-03-17 |
| 4. Planning Engine | v1.0 | 3/3 | Complete | 2026-03-18 |
| 5. Automation Foundation | v1.1 | 0/1 | Not started | - |
| 6. Categorization Rules | v1.1 | 0/2 | Not started | - |
| 7. Recurring Transactions | v1.1 | 0/2 | Not started | - |
