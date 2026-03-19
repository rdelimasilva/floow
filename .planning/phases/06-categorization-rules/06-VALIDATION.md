---
phase: 6
slug: categorization-rules
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `apps/web/vitest.config.ts`, `packages/core-finance/vitest.config.ts` |
| **Quick run command** | `cd packages/core-finance && npm run test` |
| **Full suite command** | `npm run test --workspaces` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/core-finance && npm run test`
- **After every plan wave:** Run `npm run test --workspaces`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | CAT-01 | unit | `cd apps/web && npx vitest run __tests__/finance/rule-actions.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | CAT-02 | unit | `cd apps/web && npx vitest run __tests__/finance/rule-actions.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | CAT-03 | unit | `cd apps/web && npx vitest run __tests__/finance/import-actions.test.ts` | ✅ extend | ⬜ pending |
| 06-01-04 | 01 | 1 | CAT-04 | unit | `cd apps/web && npx vitest run __tests__/finance/actions.test.ts` | ✅ extend | ⬜ pending |
| 06-01-05 | 01 | 1 | CAT-06 | unit | `cd apps/web && npx vitest run __tests__/finance/rule-actions.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | CAT-01 | manual | n/a — UI interaction | n/a | ⬜ pending |
| 06-02-02 | 02 | 2 | CAT-02 | manual | n/a — UI interaction | n/a | ⬜ pending |
| 06-02-03 | 02 | 2 | CAT-05 | manual | n/a — UI interaction | n/a | ⬜ pending |
| 06-02-04 | 02 | 2 | CAT-06 | manual | n/a — UI interaction (confirm dialog) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/__tests__/finance/rule-actions.test.ts` — stubs for CAT-01, CAT-02, CAT-06
- [ ] `packages/db/src/schema/automation.ts` — Drizzle schema for `category_rules` table
- [ ] Export `automation.ts` in `packages/db/src/schema/index.ts`
- [ ] `supabase/migrations/00007_auto_categorized.sql` — adds `is_auto_categorized boolean DEFAULT false` to transactions
- [ ] Update `packages/db/src/schema/finance.ts` — add `isAutoCategorized` field to `transactions` table object

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CreateRuleDialog renders with pre-filled values from transaction | CAT-05 | UI interaction — click "Categorizar todas como esta" on a transaction row | 1. Navigate to transactions list 2. Click action menu on a categorized transaction 3. Click "Categorizar todas como esta" 4. Verify dialog opens with description and category pre-filled |
| Rules management tab CRUD operations | CAT-01, CAT-02 | Visual layout and interaction flows | 1. Navigate to /categories 2. Switch to "Regras" tab 3. Create, edit, reorder, toggle, and delete rules |
| Bulk recategorize confirmation dialog | CAT-06 | UI interaction — confirm dialog with affected count | 1. Select a rule 2. Click "Aplicar retroativamente" 3. Verify count shown before confirmation 4. Confirm and verify only uncategorized transactions changed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
