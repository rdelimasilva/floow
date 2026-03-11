# Requirements: Floow

**Defined:** 2026-03-09
**Core Value:** O investidor experiente consegue ver seu patrimônio consolidado — finanças, investimentos e projeções futuras — tudo num único lugar.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [x] **AUTH-01**: User can sign up with email and password
- [x] **AUTH-02**: User receives email verification after signup
- [x] **AUTH-03**: User can login via magic link
- [x] **AUTH-04**: User can login via OAuth (Google, Apple)
- [x] **AUTH-05**: Multi-tenant org isolation with RLS
- [x] **AUTH-06**: User session persists across browser refresh

### Finance Engine

- [x] **FIN-01**: User can create and manage accounts (corrente, poupança, corretora)
- [x] **FIN-02**: User can register transactions (receita, despesa, transferência)
- [x] **FIN-03**: User can categorize transactions
- [x] **FIN-04**: User can view monthly cash flow
- [x] **FIN-05**: User can import OFX/CSV bank statements

### Investments Engine

- [ ] **INV-01**: User can register assets (ações BR, FIIs, ETFs, cripto, renda fixa, internacional)
- [ ] **INV-02**: User can register holding events (compra, venda, dividendo, juros, split, amortização)
- [ ] **INV-03**: User can view consolidated position with average price
- [ ] **INV-04**: User can view dividends and income details
- [ ] **INV-05**: User can view PnL per asset and total
- [ ] **INV-06**: User can view historical prices and asset evolution
- [ ] **INV-07**: Investment events integrate with cash flow (aporte=debit, resgate=credit, dividend=credit)

### Planning Engine

- [ ] **PLAN-01**: User can simulate retirement (conservative, base, aggressive scenarios)
- [ ] **PLAN-02**: User can calculate financial independence timeline
- [ ] **PLAN-03**: User can view estimated passive income
- [ ] **PLAN-04**: User can plan withdrawal strategy
- [ ] **PLAN-05**: User can create estate/succession plan (liquidity, heir distribution)

### Dashboards

- [x] **DASH-01**: Financial dashboard (account summary, balance, cash flow)
- [ ] **DASH-02**: Investment dashboard (portfolio, current value, PnL, allocation chart)
- [ ] **DASH-03**: Net worth evolution chart (time → patrimônio)
- [ ] **DASH-04**: Income dashboard (dividends, interest, monthly passive income)

### Valuation

- [x] **VAL-01**: System generates patrimony snapshots (net worth, liquid assets, liabilities, breakdown)

### Billing

- [x] **BILL-01**: Freemium plans via Stripe
- [x] **BILL-02**: Checkout and subscription management
- [x] **BILL-03**: Stripe webhooks for payment events

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Investments

- **INV-V2-01**: Automatic price updates via external API
- **INV-V2-02**: Broker import (Pluggy/Belvo integration)
- **INV-V2-03**: Benchmark comparison (CDI, IBOV, S&P500)
- **INV-V2-04**: Portfolio rebalancing suggestions

### Finance

- **FIN-V2-01**: Automatic categorization rules
- **FIN-V2-02**: Recurring transactions
- **FIN-V2-03**: Multi-currency support (BRL + USD)

### Auth

- **AUTH-V2-01**: MFA (multi-factor authentication)
- **AUTH-V2-02**: Org member invitations and roles (admin, viewer)

### Platform

- **PLAT-V2-01**: Open Finance integration (Pluggy/Belvo/Klavi)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time chat/support | Not core to financial management |
| Video content | Not relevant to product |
| PJ (pessoa jurídica) module | Fork after PF stabilizes |
| Automatic bank sync (Open Finance) | v2+ — regulatory complexity |
| Mobile-only features (biometric) | v2 — web-first validation |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Complete (01-01) |
| AUTH-06 | Phase 1 | Complete |
| FIN-01 | Phase 2 | Complete |
| FIN-02 | Phase 2 | Complete |
| FIN-03 | Phase 2 | Complete |
| FIN-04 | Phase 2 | Complete |
| FIN-05 | Phase 2 | Complete |
| INV-01 | Phase 3 | Pending |
| INV-02 | Phase 3 | Pending |
| INV-03 | Phase 3 | Pending |
| INV-04 | Phase 3 | Pending |
| INV-05 | Phase 3 | Pending |
| INV-06 | Phase 3 | Pending |
| INV-07 | Phase 3 | Pending |
| PLAN-01 | Phase 4 | Pending |
| PLAN-02 | Phase 4 | Pending |
| PLAN-03 | Phase 4 | Pending |
| PLAN-04 | Phase 4 | Pending |
| PLAN-05 | Phase 4 | Pending |
| DASH-01 | Phase 2 | Complete |
| DASH-02 | Phase 3 | Pending |
| DASH-03 | Phase 3 | Pending |
| DASH-04 | Phase 3 | Pending |
| VAL-01 | Phase 2 | Complete |
| BILL-01 | Phase 1 | Complete |
| BILL-02 | Phase 1 | Complete |
| BILL-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0

---
*Requirements defined: 2026-03-09*
*Last updated: 2026-03-09 after roadmap creation*
