---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Completed 03-01-PLAN.md — investment schema, SQL migration with RLS, computePosition and aggregateIncome pure functions with TDD tests
last_updated: "2026-03-11T03:22:39.468Z"
last_activity: 2026-03-10 — Plan 02-04 complete (financial dashboard RSC, patrimony snapshot engine, human verification passed)
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 13
  completed_plans: 10
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-09)

**Core value:** O investidor experiente consegue ver seu patrimônio consolidado — finanças, investimentos e projeções futuras — tudo num único lugar.
**Current focus:** Phase 2 — Finance Engine

## Current Position

Phase: 2 of 4 (Finance Engine) — COMPLETE
Plan: 4 of 4 in phase 02 (02-04 complete)
Status: Phase 2 fully complete — Finance Engine shipped and human-verified end-to-end
Last activity: 2026-03-10 — Plan 02-04 complete (financial dashboard RSC, patrimony snapshot engine, human verification passed)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 27 min
- Total execution time: 0.45 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Platform Foundation | 4/4 | ~110 min | 28 min |

**Recent Trend:**
- Last 5 plans: 01-01 (27 min), 01-02 (42 min)
- Trend: Baseline

*Updated after each plan completion*
| Phase 01 P03 | 6 | 3 tasks | 23 files |
| Phase 01 P04 | 35 | 3 tasks | 12 files |
| Phase 01 P05 | 1 | 1 tasks | 1 files |
| Phase 02 P01 | 4 | 2 tasks | 14 files |
| Phase 02-finance-engine P02-02 | 8 | 2 tasks | 16 files |
| Phase 02-finance-engine P03 | 9 | 2 tasks | 14 files |
| Phase 02-finance-engine P04 | ~90 | 3 tasks | 12 files |
| Phase 03-investments-engine P03-01 | 5 | 3 tasks | 12 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Supabase as backend — infra mínima, RLS nativo, escala automática
- [Init]: Drizzle ORM over Prisma — mais próximo do SQL, melhor para domínio financeiro
- [Init]: Web + Mobile from day one — avoid technical debt accumulation
- [Init]: Monorepo with Turborepo — share core-finance between web/mobile/functions
- [Init]: Freemium with Stripe — Billing wired in Phase 1 so all features ship behind plan gates
- [01-01]: pnpm 9.15+ required for catalog: syntax (plan had 9.0)
- [01-01]: @/ alias maps to apps/web root (.) not ./src/ for App Router layout
- [01-01]: shadcn/ui installed manually (not via interactive CLI) for automation
- [01-01]: Expo ~53 used (plan specified ~55 which does not exist)
- [01-02]: Drizzle schema and SQL migration maintained separately — Drizzle for TS types, SQL for RLS/triggers/functions
- [01-02]: RLS uses get_user_org_ids() SECURITY DEFINER helper — critical for query performance at scale
- [01-02]: on_auth_user_created trigger wrapped in EXCEPTION WHEN OTHERS — prevents blocking signups
- [01-02]: supabase init created manually (interactive CLI not automatable)
- [Phase 01-03]: Supabase client instantiated inside event handlers not at component level — avoids build-time errors when env vars absent during Next.js static prerendering
- [Phase 01-03]: SignOutButton extracted as separate client component — app layout is Server Component, sign-out requires browser client and router
- [Phase 01-03]: All auth methods presented as peer options in Login/Signup tabs (LOCKED DECISION) — Google, Apple, email/password, magic link equal prominence
- [Phase 01-04]: Lazy Stripe client instantiation via getStripeServer() factory — established as project pattern for all external service clients in Next.js App Router (mirrors Supabase client pattern from 01-03)
- [Phase 01-04]: Webhook correlation uses client_reference_id=orgId (not userId) — billing is org-scoped, not user-scoped
- [Phase 01-04]: Server actions for checkout/portal (not API routes) — simpler, co-located with billing page, no extra endpoint needed
- [Phase 01-05]: Inversion-based middleware protection: allowlist public routes (/auth, /api/webhooks, /) instead of blocklisting — ensures any future (app)/ route is automatically protected without code changes
- [Phase 02-01]: Integer cents for all monetary values — avoids floating-point errors in financial calculations
- [Phase 02-01]: uniqueIndex('uq_transactions_external_account') on (externalId, accountId) — PostgreSQL NULLs are distinct so non-null externalId rows get constrained; enables ON CONFLICT DO NOTHING in Plan 02-03
- [Phase 02-01]: categories.orgId nullable — NULL = system-wide defaults visible to all authenticated users via extra RLS SELECT policy
- [Phase 02-01]: core-finance tsconfig: removed rootDir constraint to allow @floow/db cross-package imports via path aliases
- [Phase 02-finance-engine]: Server actions call getOrgId() reading org from JWT app_metadata.org_ids[0] — no extra DB lookup needed, stateless, matches auth trigger pattern
- [Phase 02-finance-engine]: Transfer balance updates: two separate atomic SQL calls (not a DB transaction) — acceptable for MVP; true tx would require Drizzle .transaction() and shared connection
- [Phase 02-finance-engine]: TransactionForm uses Controller from react-hook-form for shadcn Select — Radix Select is controlled component, register() doesn't work directly
- [Phase 02-03]: ofx-js.d.ts in packages/core-finance/src/types/ — inside src/ tree so web typecheck resolves it via path alias
- [Phase 02-03]: CashFlowChart negates expense for display (both bars above X axis) while raw data keeps negative amountCents convention
- [Phase 02-03]: importTransactions balance delta computed from .returning() inserted rows — skipped duplicates excluded from balance update
- [Phase 02-04]: computeSnapshot is a pure function taking Account[] — no DB dependency, fully testable in isolation; computeAndSaveSnapshot is thin DB wrapper (pattern for all future domain computations)
- [Phase 02-04]: Client components import directly from submodule (e.g., @floow/core-finance/snapshot) not barrel index — prevents webpack bundling ofx-js (Node-only) into browser bundle
- [Phase 02-04]: db.transaction() wraps transfer balance updates and import insertions for atomicity — replaces earlier two-separate-SQL-calls pattern from Plan 02-02
- [Phase 02-04]: Fail-fast env var validation at startup — missing vars cause immediate descriptive error instead of silent runtime failure deep in call stack
- [Phase 03-01]: PortfolioEventRow for DB inferred type (not PortfolioEvent) to avoid name clash with pure function PortfolioEventInput interface in portfolio.ts
- [Phase 03-01]: UTC date methods in aggregateIncome: getUTCFullYear/getUTCMonth instead of local time getFullYear/getMonth to prevent timezone bugs when dates parsed as UTC midnight strings
- [Phase 03-01]: splitRatio stored as string in PortfolioEventInput: numeric precision preserved without floating-point errors, parsed via parseFloat only when needed
- [Phase 03-01]: accountId in portfolioEvents is application-level FK (not DB FK): avoids cross-schema complications between assets and accounts tables

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-11T03:22:39.466Z
Stopped at: Completed 03-01-PLAN.md — investment schema, SQL migration with RLS, computePosition and aggregateIncome pure functions with TDD tests
Resume file: None
