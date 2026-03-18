---
phase: 4
slug: planning-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `packages/core-finance/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @floow/core-finance test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @floow/core-finance test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | PLAN-01 | unit | `pnpm --filter @floow/core-finance test` (simulation.test.ts) | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | PLAN-01 | unit | same | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | PLAN-02 | unit | `pnpm --filter @floow/core-finance test` (simulation.test.ts) | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | PLAN-02 | unit | same | ❌ W0 | ⬜ pending |
| 04-01-05 | 01 | 1 | PLAN-03 | unit | `pnpm --filter @floow/core-finance test` (income.test.ts) | ✅ | ⬜ pending |
| 04-02-01 | 02 | 2 | PLAN-04 | unit | `pnpm --filter @floow/core-finance test` (withdrawal.test.ts) | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | PLAN-04 | unit | same | ❌ W0 | ⬜ pending |
| 04-02-03 | 02 | 2 | PLAN-05 | unit | `pnpm --filter @floow/core-finance test` (succession.test.ts) | ❌ W0 | ⬜ pending |
| 04-02-04 | 02 | 2 | PLAN-05 | unit | same | ❌ W0 | ⬜ pending |
| 04-02-05 | 02 | 2 | PLAN-05 | unit | same | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/core-finance/src/__tests__/simulation.test.ts` — stubs for PLAN-01, PLAN-02
- [ ] `packages/core-finance/src/__tests__/withdrawal.test.ts` — stubs for PLAN-04
- [ ] `packages/core-finance/src/__tests__/succession.test.ts` — stubs for PLAN-05

*Existing infrastructure covers PLAN-03 (income.test.ts already exists).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Retirement chart renders 3 scenarios visually | PLAN-01 | Visual rendering — Recharts output | Load /planning page, verify 3 colored lines on chart |
| FI timeline badge displays correct date | PLAN-02 | UI presentation | Create retirement plan, verify FI date badge |
| Succession ITCMD disclaimer shows | PLAN-05 | Legal disclaimer text | Navigate to succession page, verify disclaimer visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
