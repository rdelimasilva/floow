---
phase: 3
slug: investments-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `packages/core-finance/vitest.config.ts` |
| **Quick run command** | `cd packages/core-finance && pnpm test` |
| **Full suite command** | `pnpm --filter @floow/core-finance test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @floow/core-finance test`
- **After every plan wave:** Run `pnpm --filter @floow/core-finance test && pnpm --filter @floow/db typecheck && pnpm --filter @floow/web typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | INV-01 | manual-only | N/A — requires Supabase test DB | N/A | ⬜ pending |
| 03-01-02 | 01 | 1 | INV-02 | manual-only | N/A — requires Supabase test DB | N/A | ⬜ pending |
| 03-02-01 | 02 | 1 | INV-03 | unit | `pnpm --filter @floow/core-finance test -- portfolio` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | INV-03 | unit | `pnpm --filter @floow/core-finance test -- portfolio` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | INV-02 | unit | `pnpm --filter @floow/core-finance test -- portfolio` | ❌ W0 | ⬜ pending |
| 03-02-04 | 02 | 1 | INV-05 | unit | `pnpm --filter @floow/core-finance test -- portfolio` | ❌ W0 | ⬜ pending |
| 03-02-05 | 02 | 1 | INV-04 | unit | `pnpm --filter @floow/core-finance test -- income` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | INV-07 | manual-only | N/A — requires Supabase test DB | N/A | ⬜ pending |
| 03-03-02 | 03 | 2 | INV-06 | manual-only | N/A — requires Supabase test DB | N/A | ⬜ pending |
| 03-04-01 | 04 | 2 | DASH-02 | manual-only | N/A — browser render | N/A | ⬜ pending |
| 03-04-02 | 04 | 2 | DASH-03 | manual-only | N/A — browser render | N/A | ⬜ pending |
| 03-04-03 | 04 | 2 | DASH-04 | manual-only | N/A — browser render | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/core-finance/src/__tests__/portfolio.test.ts` — stubs for INV-03, INV-02, INV-05
- [ ] `packages/core-finance/src/__tests__/income.test.ts` — stubs for INV-04

*Existing infrastructure covers framework — Vitest already configured in `packages/core-finance/vitest.config.ts`*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Asset registry CRUD | INV-01 | Requires Supabase test DB with RLS | Create/edit/delete asset via UI, verify DB state |
| Portfolio event logging | INV-02 | Requires Supabase test DB with RLS | Log buy/sell/dividend events, verify DB records |
| Cash flow integration | INV-07 | Requires Supabase test DB with transactions | Create investment event, verify corresponding cash flow transaction created |
| Historical price entry | INV-06 | Requires Supabase test DB | Enter asset price, verify stored and displayed |
| Portfolio allocation chart | DASH-02 | Browser render verification | Navigate to dashboard, verify pie chart renders with correct data |
| Net worth evolution chart | DASH-03 | Browser render verification | Navigate to dashboard, verify line chart renders with time series |
| Income dashboard | DASH-04 | Browser render verification | Navigate to income page, verify dividend history and monthly estimates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
