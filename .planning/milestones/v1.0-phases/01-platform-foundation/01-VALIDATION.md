---
phase: 1
slug: platform-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit + integration) + Playwright (e2e) |
| **Config file** | `vitest.config.ts` per package; `playwright.config.ts` at root — Wave 0 |
| **Quick run command** | `pnpm --filter @floow/db test` / `pnpm --filter @floow/web test` |
| **Full suite command** | `pnpm turbo run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm turbo run test --filter=...[HEAD^1]`
- **After every plan wave:** Run `pnpm turbo run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | — | smoke | `pnpm turbo run build` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | AUTH-05 | integration | `pnpm --filter @floow/db test rls` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | AUTH-01 | integration | `pnpm --filter @floow/web test auth` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | AUTH-02 | e2e | `pnpm exec playwright test auth/email-verification` | ❌ W0 | ⬜ pending |
| 01-03-03 | 03 | 2 | AUTH-03 | e2e | `pnpm exec playwright test auth/magic-link` | ❌ W0 | ⬜ pending |
| 01-03-04 | 03 | 2 | AUTH-04 | manual | Manual — OAuth requires real credentials | N/A | ⬜ pending |
| 01-03-05 | 03 | 2 | AUTH-06 | e2e | `pnpm exec playwright test auth/session-persistence` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 2 | BILL-01 | integration | `pnpm --filter @floow/web test billing` | ❌ W0 | ⬜ pending |
| 01-04-02 | 04 | 2 | BILL-02 | integration | `pnpm --filter @floow/web test checkout` | ❌ W0 | ⬜ pending |
| 01-04-03 | 04 | 2 | BILL-03 | unit | `pnpm --filter @floow/web test webhooks/stripe` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` per app/package — unit test runner setup
- [ ] `playwright.config.ts` at monorepo root — e2e test runner setup
- [ ] `packages/db/src/__tests__/rls.test.ts` — stubs for AUTH-05
- [ ] `apps/web/__tests__/auth/signup.test.ts` — stubs for AUTH-01, AUTH-02
- [ ] `apps/web/__tests__/billing/webhook.test.ts` — stubs for BILL-03
- [ ] Framework install: `pnpm add -D vitest @vitest/coverage-v8 playwright`
- [ ] Supabase local dev: `supabase start` for integration test DB with RLS

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OAuth Google/Apple redirect and session created | AUTH-04 | OAuth providers require real credentials and redirect flows | 1. Click Google/Apple button 2. Complete OAuth flow 3. Verify session created and dashboard accessible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
