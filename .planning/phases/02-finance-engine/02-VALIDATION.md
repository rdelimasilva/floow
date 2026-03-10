---
phase: 02
slug: finance-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | `apps/web/vitest.config.ts` (web), `packages/db/vitest.config.ts` (db) |
| **Quick run command** | `pnpm --filter @floow/core-finance test && pnpm --filter @floow/db test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @floow/core-finance test && pnpm --filter @floow/db test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | FIN-01 | unit | `pnpm --filter @floow/db test -- schema` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | FIN-02 | unit | `pnpm --filter @floow/db test -- schema` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | FIN-03 | unit | `pnpm --filter @floow/db test -- schema` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | FIN-02 | unit | `pnpm --filter @floow/core-finance test` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 3 | FIN-05 | unit | `pnpm --filter @floow/core-finance test` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 3 | FIN-04 | unit | `pnpm --filter @floow/core-finance test` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 4 | DASH-01 | unit (RTL) | `pnpm --filter @floow/web test -- dashboard` | ❌ W0 | ⬜ pending |
| 02-04-02 | 04 | 4 | VAL-01 | unit | `pnpm --filter @floow/core-finance test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/core-finance/package.json` — add `vitest` to devDependencies and `test` script
- [ ] `packages/db/src/__tests__/finance-schema.test.ts` — stubs for FIN-01, FIN-02, FIN-03 schema exports
- [ ] `packages/core-finance/src/__tests__/balance.test.ts` — covers atomic balance update logic
- [ ] `packages/core-finance/src/__tests__/cash-flow.test.ts` — covers FIN-04 aggregation
- [ ] `packages/core-finance/src/__tests__/import-ofx.test.ts` — covers FIN-05 OFX parsing
- [ ] `packages/core-finance/src/__tests__/import-csv.test.ts` — covers FIN-05 CSV parsing
- [ ] `packages/core-finance/src/__tests__/snapshot.test.ts` — covers VAL-01
- [ ] `apps/web/__tests__/finance/dashboard.test.tsx` — covers DASH-01 render

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OFX file from real Brazilian bank parses correctly | FIN-05 | Edge cases vary by bank; test data is PII-sensitive | Upload real .ofx file from Itaú/Nubank/BB; verify dates and amounts match |
| Dashboard renders charts with real data | DASH-01 | Visual layout verification | Log in, create accounts + transactions, verify dashboard renders correctly |
| RLS isolation between tenants | FIN-01 | Requires live Supabase with two users | Create two users in different orgs; verify user A cannot see user B's accounts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
