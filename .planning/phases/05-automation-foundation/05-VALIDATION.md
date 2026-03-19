---
phase: 5
slug: automation-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3.0.0 (v3.2.4 installed) |
| **Config file** | `packages/core-finance/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @floow/core-finance test` |
| **Full suite command** | `pnpm --filter @floow/core-finance test && pnpm --filter @floow/core-finance typecheck` |
| **Estimated runtime** | ~1 second |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @floow/core-finance test`
- **After every plan wave:** Run `pnpm --filter @floow/core-finance test && pnpm --filter @floow/core-finance typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | SC-1 (migration) | manual | `supabase db reset` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | SC-2 (matchCategory) | unit | `pnpm --filter @floow/core-finance test categorization` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | SC-2 (priority tie-breaking) | unit | `pnpm --filter @floow/core-finance test categorization` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | SC-3 (getOverdueDates) | unit | `pnpm --filter @floow/core-finance test recurring` | ❌ W0 | ⬜ pending |
| 05-01-05 | 01 | 1 | SC-3 (advanceByFrequency) | unit | `pnpm --filter @floow/core-finance test recurring` | ❌ W0 | ⬜ pending |
| 05-01-06 | 01 | 1 | SC-3 (month-end edge cases) | unit | `pnpm --filter @floow/core-finance test recurring` | ❌ W0 | ⬜ pending |
| 05-01-07 | 01 | 1 | SC-4 (exports build) | automated | `pnpm --filter @floow/core-finance typecheck` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/core-finance/src/__tests__/categorization.test.ts` — stubs for matchCategory (all match types, priority, case-insensitivity, null cases)
- [ ] `packages/core-finance/src/__tests__/recurring.test.ts` — stubs for all 6 frequencies, month-end clamp, multiple overdue dates, empty array for future dates

*Existing infrastructure covers framework needs — test runner is fully operational.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration runs cleanly on fresh Supabase | SC-1 | Requires Supabase local instance | Run `supabase db reset` and verify both tables, RLS policies, indexes created |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 2s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
