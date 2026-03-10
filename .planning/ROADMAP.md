# Roadmap: Floow

## Overview

Floow ships in four phases, each delivering a complete, verifiable capability. Phase 1 builds the platform foundation — monorepo, auth, and billing — so every subsequent phase inherits tenant isolation and monetization from day one. Phase 2 delivers the Finance Engine, letting users track daily cash flow before investments enter the picture. Phase 3 layers the Investments Engine on top of the financial base, producing consolidated portfolio views and the wealth evolution chart that is the product's signature. Phase 4 closes with the Planning Engine, transforming accumulated data into retirement simulations, financial independence timelines, and succession planning.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Platform Foundation** - Monorepo, Supabase, multi-tenant auth, and Stripe billing (completed 2026-03-10)
- [ ] **Phase 2: Finance Engine** - Accounts, transactions, cash flow, and financial dashboard
- [ ] **Phase 3: Investments Engine** - Assets, portfolio events, PnL, and investment dashboards
- [ ] **Phase 4: Planning Engine** - Retirement simulation, financial independence, and succession planning

## Phase Details

### Phase 1: Platform Foundation
**Goal**: Users can sign up, log in with multiple methods, and access a billing-gated SaaS application with full tenant isolation
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, BILL-01, BILL-02, BILL-03
**Success Criteria** (what must be TRUE):
  1. User can create an account with email and password and receives a verification email
  2. User can log in via magic link or OAuth (Google, Apple) and session persists across browser refresh
  3. Each user's data is fully isolated — no tenant can access another tenant's data (RLS enforced)
  4. User can subscribe to a paid plan via Stripe checkout and the app reflects their plan status
  5. Stripe webhooks update subscription state (payment success, cancellation, renewal)
**Plans**: 5 plans

Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold (Turborepo, pnpm, app/package structure, shadcn/ui, Vitest)
- [x] 01-02-PLAN.md — Supabase schema, RLS policies, triggers, Drizzle ORM setup
- [x] 01-03-PLAN.md — Auth flows (email/password, magic link, OAuth Google/Apple, session persistence)
- [x] 01-04-PLAN.md — Stripe billing (freemium plans, checkout, subscription management, webhooks)
- [ ] 01-05-PLAN.md — Gap closure: fix middleware route protection (inversion-based pattern)

### Phase 2: Finance Engine
**Goal**: Users can track their daily financial life — accounts, transactions, cash flow — and view a consolidated financial dashboard with patrimony snapshots
**Depends on**: Phase 1
**Requirements**: FIN-01, FIN-02, FIN-03, FIN-04, FIN-05, DASH-01, VAL-01
**Success Criteria** (what must be TRUE):
  1. User can create accounts (checking, savings, brokerage) and see their current balances
  2. User can register income, expense, and transfer transactions with categories
  3. User can view monthly cash flow broken down by category
  4. User can import bank statements via OFX or CSV to populate transaction history
  5. Financial dashboard shows account summary, balances, and cash flow at a glance
  6. System generates a patrimony snapshot capturing net worth, liquid assets, liabilities, and breakdown
**Plans**: TBD

Plans:
- [ ] 02-01: Account and transaction data model (Drizzle schema, RLS, core-finance package)
- [ ] 02-02: Transaction registration and categorization (web + API)
- [ ] 02-03: OFX/CSV import and cash flow views
- [ ] 02-04: Financial dashboard (DASH-01) and patrimony snapshot engine (VAL-01)

### Phase 3: Investments Engine
**Goal**: Users can manage their complete investment portfolio across all asset classes, see consolidated positions with PnL, and visualize wealth evolution
**Depends on**: Phase 2
**Requirements**: INV-01, INV-02, INV-03, INV-04, INV-05, INV-06, INV-07, DASH-02, DASH-03, DASH-04
**Success Criteria** (what must be TRUE):
  1. User can register assets across all classes (BR equities, FIIs, ETFs, crypto, fixed income, international) and log portfolio events (buy, sell, dividend, split, amortization)
  2. User can see consolidated position with automatic average price calculation per asset
  3. User can view PnL per asset and total portfolio, plus dividends and income details
  4. Investment events automatically integrate with cash flow (contribution = debit, withdrawal = credit, dividend = credit)
  5. Investment dashboard shows portfolio value, PnL, and allocation chart by asset class
  6. Net worth evolution chart displays how total patrimony changed over time
  7. Income dashboard shows dividend history, interest, and estimated monthly passive income
**Plans**: TBD

Plans:
- [ ] 03-01: Asset registry and portfolio event model (Drizzle schema, RLS, core-finance extension)
- [ ] 03-02: Position calculation engine (average price, PnL, split/amortization logic)
- [ ] 03-03: Cash flow integration (INV-07) and historical price/valuation tracking (INV-06)
- [ ] 03-04: Investment dashboards (DASH-02, DASH-03, DASH-04)

### Phase 4: Planning Engine
**Goal**: Users can simulate retirement scenarios, calculate their financial independence timeline, and plan wealth transfer to heirs
**Depends on**: Phase 3
**Requirements**: PLAN-01, PLAN-02, PLAN-03, PLAN-04, PLAN-05
**Success Criteria** (what must be TRUE):
  1. User can run retirement simulations across three scenarios (conservative, base, aggressive) with visual projections
  2. User can calculate the date and required portfolio size to reach financial independence
  3. User can view estimated monthly passive income based on current portfolio composition
  4. User can define a withdrawal strategy (amount, sequence, order of asset liquidation)
  5. User can create a succession plan specifying liquidity needs and distribution percentages per heir
**Plans**: TBD

Plans:
- [ ] 04-01: Retirement and financial independence simulation engine (PLAN-01, PLAN-02, PLAN-03)
- [ ] 04-02: Withdrawal strategy and succession planning (PLAN-04, PLAN-05)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Platform Foundation | 4/5 | Gap closure | - |
| 2. Finance Engine | 0/4 | Not started | - |
| 3. Investments Engine | 0/4 | Not started | - |
| 4. Planning Engine | 0/2 | Not started | - |
