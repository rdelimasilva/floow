# Roadmap: Floow

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-18)
- ✅ **v1.1 Automação** — Phases 5-7 (completed 2026-03-31)
- 🚧 **v2.0 Open Finance & Automação de Dados** — Phases 8-10 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-18</summary>

- [x] Phase 1: Platform Foundation (5/5 plans) — completed 2026-03-10
- [x] Phase 2: Finance Engine (4/4 plans) — completed 2026-03-11
- [x] Phase 3: Investments Engine (4/4 plans) — completed 2026-03-17
- [x] Phase 4: Planning Engine (3/3 plans) — completed 2026-03-18

</details>

<details>
<summary>✅ v1.1 Automação (Phases 5-7) — COMPLETED 2026-03-31</summary>

- [x] **Phase 5: Automation Foundation** - DB schema migrations, pure functions, and unit tests for both automation features (completed 2026-03-19)
- [x] **Phase 6: Categorization Rules** - Complete CRUD, auto-apply on import and manual creation, rule-from-transaction shortcut, and retroactive application with preview (completed 2026-03-19)
- [x] **Phase 7: Recurring Transactions** - Complete CRUD, upcoming-due list, manual generation, and pause/reactivation (completed 2026-03-29)

</details>

### 🚧 v2.0 Open Finance & Automação de Dados (In Progress)

**Milestone Goal:** Conectar contas bancárias via Open Finance para importar extratos automaticamente, atualizar cotações de ativos em tempo real, e reconciliar/categorizar tudo sem intervenção manual.

- [ ] **Phase 8: Asset Price Updates** - Cron jobs that pull daily closing prices from B3, CoinGecko, and BCB so portfolio views show live market values without any user action
- [ ] **Phase 9: Open Finance Connection** - Polp widget integration with consent lifecycle management and a connections management screen
- [ ] **Phase 10: Sync Pipeline & Reconciliation** - Auto-import of bank transactions with exact dedup, fuzzy match reconciliation preview, and auto-categorization via existing rules

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
**Plans:** 1/1 plans complete

Plans:
- [x] 05-01-PLAN.md — DB migration (category_rules + recurring_templates) and pure functions (matchCategory, advanceByFrequency, getOverdueDates) with TDD tests

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
**Plans:** 2/2 plans complete

Plans:
- [x] 06-01-PLAN.md — Drizzle schema for category_rules, isAutoCategorized migration, CRUD server actions, auto-categorize hooks in createTransaction and import, retroactive bulk-categorize
- [x] 06-02-PLAN.md — UI: Regras tab on /categories with rules table, create/edit dialog, transaction row shortcut, auto badge

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
**Plans**: 2/2 plans complete

Plans:
- [x] 07-01-PLAN.md — Drizzle schema for recurringTemplates, recurringTemplateId on transactions, CRUD server actions, generateRecurringTransaction with atomic balance update + dedup + auto-categorize, toggleRecurringActive, recurring queries
- [x] 07-02-PLAN.md — UI: /transactions/recurring page with template list, upcoming-due section, create/edit dialog, generate/pause actions, sidebar nav item

### Phase 8: Asset Price Updates
**Goal**: Portfolio views show live market prices for all asset classes without any manual action from the user
**Depends on**: Phase 7 (v1.1 complete)
**Requirements**: PRICE-01, PRICE-02, PRICE-03, PRICE-04
**Success Criteria** (what must be TRUE):
  1. User opens the investments portfolio and sees today's closing prices for B3 equities, FIIs, ETFs, and BDRs — no manual entry required
  2. User's crypto holdings display prices updated from CoinGecko in BRL without any action
  3. Fixed income assets (CDB, LCI, LCA, Tesouro) display valuations based on current CDI/SELIC rates fetched from the BCB API
  4. Portfolio PnL and net worth totals reflect current prices and update automatically each trading day
**Plans**: 3 plans

Plans:
- [ ] 08-01-PLAN.md — DB migrations (global_asset_prices, economic_indicators, pricing_type/coingecko_id on assets) + computeAccrualPrice() pure function with TDD
- [ ] 08-02-PLAN.md — brapi/CoinGecko/BCB API clients, daily price orchestrator, authenticated API route, Netlify cron at 19:00 UTC weekdays
- [ ] 08-03-PLAN.md — Wire global_asset_prices into getLatestPrices() and recomputeOrgPositionSnapshots() for live portfolio values

### Phase 9: Open Finance Connection
**Goal**: Users can securely connect their bank accounts via the Polp widget and manage connection health from a dedicated screen
**Depends on**: Phase 8
**Requirements**: OF-01, OF-03, OF-04
**Success Criteria** (what must be TRUE):
  1. User can connect a bank account by clicking "Conectar conta" which opens the Polp widget — the bank credential is never seen by Floow
  2. User can set a connection start date during the wizard to prevent overlap with previously imported OFX/CSV data
  3. User can view all connected accounts on the connections page with status badges (active, expiring, error)
  4. User can reconnect an expired/revoked connection or disconnect a bank account from the connections page
**Plans**: TBD
**UI hint**: yes

### Phase 10: Sync Pipeline & Reconciliation
**Goal**: Bank transactions are imported automatically each day and users can review matches against existing manual entries before confirming
**Depends on**: Phase 9
**Requirements**: OF-02, RECON-01, RECON-02, RECON-03, ICAT-01
**Success Criteria** (what must be TRUE):
  1. Transactions already in Floow are not duplicated when the same bank transaction is imported again — exact external ID dedup prevents silent re-imports
  2. User sees a reconciliation preview listing NEW, MATCHED, and DUPLICATE transactions before any sync is committed
  3. Transactions flagged as MATCHED show the corresponding manual entry so the user can approve or reject the match
  4. Imported transactions that pass review are automatically assigned categories by the existing categorization rules without the user having to re-categorize
  5. User can see a "last synced" timestamp and a summary of what changed after each automatic sync
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Platform Foundation | v1.0 | 5/5 | Complete | 2026-03-10 |
| 2. Finance Engine | v1.0 | 4/4 | Complete | 2026-03-11 |
| 3. Investments Engine | v1.0 | 4/4 | Complete | 2026-03-17 |
| 4. Planning Engine | v1.0 | 3/3 | Complete | 2026-03-18 |
| 5. Automation Foundation | v1.1 | 1/1 | Complete | 2026-03-19 |
| 6. Categorization Rules | v1.1 | 2/2 | Complete | 2026-03-19 |
| 7. Recurring Transactions | v1.1 | 2/2 | Complete | 2026-03-31 |
| 8. Asset Price Updates | v2.0 | 0/3 | Not started | - |
| 9. Open Finance Connection | v2.0 | 0/? | Not started | - |
| 10. Sync Pipeline & Reconciliation | v2.0 | 0/? | Not started | - |
