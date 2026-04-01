---
phase: 8
slug: asset-price-updates
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing in core-finance) |
| **Config file** | `packages/core-finance/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @floow/core-finance test` |
| **Full suite command** | `pnpm --filter @floow/core-finance test && npx tsc --noEmit -p apps/web/tsconfig.json` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @floow/core-finance test`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | PRICE-01..04 | schema | `npx tsc --noEmit -p packages/db/tsconfig.json` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | PRICE-03 | unit | `pnpm --filter @floow/core-finance test` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 2 | PRICE-01 | integration | `npx tsc --noEmit -p apps/web/tsconfig.json` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 2 | PRICE-02 | integration | `npx tsc --noEmit -p apps/web/tsconfig.json` | ❌ W0 | ⬜ pending |
| 08-02-03 | 02 | 2 | PRICE-03 | integration | `npx tsc --noEmit -p apps/web/tsconfig.json` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/core-finance/src/__tests__/accrual-price.test.ts` — tests for computeAccrualPrice (CDI 252-day convention)
- [ ] Migration 00024 for global_asset_prices table

*Existing test infrastructure covers TypeScript compilation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Portfolio shows updated prices | PRICE-04 | Requires DB with real data + UI render | Open /investments, verify prices match brapi/CoinGecko |
| Cron triggers daily | PRICE-01..03 | Requires Netlify scheduled function | Check Netlify function logs after deploy |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
