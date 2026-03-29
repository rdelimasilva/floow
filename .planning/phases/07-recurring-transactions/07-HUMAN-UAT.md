---
status: partial
phase: 07-recurring-transactions
source: [07-VERIFICATION.md]
started: 2026-03-29T11:00:00Z
updated: 2026-03-29T11:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Template Creation and List Display
expected: Template immediately appears in "Todas as recorrencias" table with correct values after creating via "Nova Recorrencia" dialog
result: [pending]

### 2. Edit Mode Pre-fill and Update
expected: Pencil icon opens dialog with pre-filled values; after changing description and saving, table row updates
result: [pending]

### 3. Delete With Confirmation and History Preservation
expected: ConfirmDialog shows preservation message; template removed; previously generated transactions still in /transactions
result: [pending]

### 4. "Gerar agora" — Transaction Creation and Balance Update
expected: Toast shows count; transaction appears in /transactions; account balance updated in /accounts; nextDueDate advances
result: [pending]

### 5. Dedup Guard — No Duplicate on Second Click
expected: Toast shows "Nenhuma transacao a gerar — proxima data no futuro." on second click
result: [pending]

### 6. Pause/Reactivate Without History Loss
expected: Status toggles between Ativo/Pausado; paused template disappears from upcoming; nextDueDate unchanged after reactivate
result: [pending]

### 7. Sidebar Navigation
expected: "Recorrentes" link in sidebar Cadastros section navigates to /transactions/recurring with active state
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
