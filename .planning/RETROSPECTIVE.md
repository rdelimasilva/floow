# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-18
**Phases:** 4 | **Plans:** 16 | **Commits:** 98

### What Was Built
- Multi-tenant SaaS platform with auth (email, magic link, OAuth) and Stripe billing
- Finance engine: accounts, transactions, OFX/CSV import, cash flow, patrimony snapshots
- Investment portfolio: 6 asset classes, portfolio events, PnL, allocation, net worth evolution, income dashboard
- Planning engine: retirement simulation (3 scenarios), FI calculator, withdrawal strategy, succession planning with ITCMD

### What Worked
- Pure function + thin DB wrapper pattern made core-finance highly testable and reusable
- TDD approach for computation engines caught edge cases early (floating-point, timezone bugs)
- Server actions over API routes kept code co-located and simple
- RSC + Suspense streaming provided clean data loading patterns
- Integer cents for all monetary values eliminated precision issues across all 4 phases
- Submodule imports solved webpack bundling of Node-only dependencies

### What Was Inefficient
- ROADMAP.md Phase 3 checkbox and progress table not updated during execution — required manual reconciliation at milestone completion
- STATE.md current position stuck at Phase 2 — state tracking fell behind actual progress
- Some early Phase 2 decisions (two separate SQL calls for transfers) were revised in later plans — could have been caught with stronger upfront design

### Patterns Established
- `getOrgId()` from JWT `app_metadata.org_ids[0]` — stateless org resolution, no DB lookup
- `computeX()` pure + `computeAndSaveX()` DB wrapper — separation of computation and persistence
- Submodule imports (`@floow/core-finance/src/balance`) in client components
- `uniqueIndex` on `orgId` + `onConflictDoUpdate` for single-per-org resources
- `formatBRL(cents/100)` at display boundary — store cents, display BRL
- Controller from react-hook-form for Radix/shadcn controlled components

### Key Lessons
1. Keep ROADMAP.md and STATE.md in sync during execution — stale tracking creates confusion at milestone completion
2. Integer cents from day one eliminates an entire class of financial bugs
3. Pure function TDD for domain logic pays off quickly — computePosition, aggregateIncome, simulateRetirement all benefited
4. Inversion-based middleware (allowlist public routes) is more secure than blocklist — new routes are auto-protected

### Cost Observations
- Model mix: ~60% sonnet (execution), ~30% opus (planning/verification), ~10% haiku
- Sessions: ~15-20 across 9 days
- Notable: Balanced profile worked well for this project size

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | 98 | 4 | Initial MVP — established all core patterns |

### Cumulative Quality

| Milestone | LOC | Files | Requirements |
|-----------|-----|-------|-------------|
| v1.0 | 16,503 | 252 | 31/31 |

### Top Lessons (Verified Across Milestones)

1. Pure computation + thin DB wrapper is the right pattern for financial domain logic
2. Integer cents eliminates floating-point issues — non-negotiable for financial apps
