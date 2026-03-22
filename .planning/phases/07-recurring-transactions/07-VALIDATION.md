---
phase: 7
slug: recurring-transactions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `packages/core-finance/vitest.config.ts`, `apps/web/tsconfig.json` |
| **Quick run command** | `pnpm --filter @floow/core-finance test` |
| **Full suite command** | `npx tsc --noEmit -p apps/web/tsconfig.json && npx tsc --noEmit -p packages/db/tsconfig.json` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @floow/core-finance test` + TypeScript check
- **After every plan:** Run full TypeScript compilation across db and web packages
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | REC-01 | compilation | `npx tsc --noEmit -p packages/db/tsconfig.json` | N/A | pending |
| 07-01-02 | 01 | 1 | REC-01,02,03,05 | compilation | `npx tsc --noEmit -p apps/web/tsconfig.json` | N/A | pending |
| 07-02-01 | 02 | 2 | REC-01,02,03,04,05 | compilation + manual | `npx tsc --noEmit -p apps/web/tsconfig.json` | N/A | pending |
| 07-02-02 | 02 | 2 | REC-04 | manual | n/a — sidebar nav | n/a | pending |
| 07-02-03 | 02 | 2 | ALL | manual-verify | User verification of all features | n/a | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `packages/db/src/schema/automation.ts` — add `recurringTemplates` Drizzle table + types
- [ ] `packages/db/src/schema/finance.ts` — add `recurringTemplateId` field to transactions
- [ ] Export updated types from `packages/db/src/index.ts` (already exports automation)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Create recurring template via dialog | REC-01 | UI interaction | 1. Navigate to /transactions/recurring 2. Click "Nova Recorrencia" 3. Fill form 4. Verify template appears in list |
| Edit and delete template | REC-02 | UI interaction | 1. Click edit on template 2. Change fields 3. Save 4. Click delete on another template 5. Confirm deletion |
| Generate transaction via "Gerar agora" | REC-03 | UI + balance verification | 1. Create template with past due date 2. Click "Gerar agora" 3. Verify transaction appears in /transactions 4. Verify account balance updated 5. Verify nextDueDate advanced 6. Click again — verify no duplicate |
| Upcoming due list shows correct templates | REC-04 | UI layout verification | 1. Create templates with various due dates 2. Verify only due-within-30-days active templates appear 3. Verify sorted by date |
| Pause and reactivate | REC-05 | UI interaction | 1. Pause a template 2. Verify it disappears from upcoming section 3. Reactivate 4. Verify it reappears with unchanged nextDueDate |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
