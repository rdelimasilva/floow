# Account Drill-down & Import Reconciliation Design

## Feature 1: Account Drill-down Page

### Purpose

Allow users to click an account and see its details + filtered transactions in a dedicated page, providing context that a simple URL redirect to `/transactions?accountId=xxx` would lack.

### Route

`/accounts/[accountId]/page.tsx` (server component)

### Layout

- **Header**: account name, type badge (checking/savings/brokerage/etc.), current balance, back button to `/accounts`
- **Filters**: search (description) + date range (start/end). No account selector — already scoped.
- **Transaction table**: reuse existing `TransactionList` component
- **Pagination**: reuse existing `Pagination` component

### Data

- **New query**: `getAccountById(orgId, accountId)` — fetch single account with org ownership check
- **Existing queries**: `getTransactions(orgId, { accountId, ...filters })` + `getTransactionCount(orgId, { accountId, ...filters })`
- **Existing**: `getCategories(orgId)` for transaction display

### Navigation

- `AccountCard` becomes clickable (Link to `/accounts/[id]`)
- Edit/delete buttons remain on the card (or move to drill-down page header)

### Components

- **Page** (`/accounts/[accountId]/page.tsx`): server component, parallel data fetch
- **AccountHeader**: displays account name, type, balance (simple, not a separate component — inline in page)
- Reuses: `TransactionList`, `Pagination`, `TransactionFilters` (modified to omit account selector when `accountId` prop is set)

---

## Feature 2: Import Reconciliation UI

### Purpose

Give users a preview of what will be imported before committing, with the ability to deselect individual transactions. Currently, import is fire-and-forget with auto-dedup via unique constraint.

### Flow

```
Select file + account → [Preview] → previewImport() server action
                                          ↓
                                   ImportPreview component
                                   (categorized transactions)
                                          ↓
                              User selects/deselects items
                                          ↓
                           [Import Selected] → importSelectedTransactions()
                                          ↓
                              Toast: "X imported, Y skipped"
```

### Matching Logic

| Category | Criteria | Default State |
|----------|----------|---------------|
| NEW | No match found | Checked (green) |
| DUPLICATE | Same `externalId` + same account | Unchecked (gray) |
| POSSIBLE_MATCH | Same `amountCents` + date within ±1 day + same account | Checked (yellow) |

### Server Actions

#### `previewImport(formData: FormData)`

- Input: file content + file type (OFX/CSV) + accountId + CSV config (columns, date format)
- Process:
  1. Parse file using existing OFX/CSV parsers (pure functions from `@floow/core-finance`)
  2. Query existing transactions for the account (last 90 days or matching date range)
  3. For each parsed transaction, classify as NEW / DUPLICATE / POSSIBLE_MATCH
- Output: `{ items: PreviewItem[] }` where `PreviewItem = { index, parsedTx, status, matchedTx? }`

#### `importSelectedTransactions(formData: FormData)`

- Input: file content + file type + accountId + CSV config + selected indices (JSON array)
- Process:
  1. Re-parse file (stateless — no server-side session storage)
  2. Filter to selected indices only
  3. Insert with `ON CONFLICT DO NOTHING` (safety net)
  4. Atomic balance update via `sql\`balance_cents + ${delta}\``
- Output: `{ imported: number, skipped: number }`

### Components

#### `ImportPreview` (client component)

- Props: `{ items: PreviewItem[], onConfirm(selectedIndices), onCancel() }`
- UI:
  - Summary bar: "15 new, 3 duplicates, 2 possible matches"
  - Select all / deselect all for each category
  - Table with columns: checkbox, date, description, amount, status badge
  - Status badges: green "Nova", gray "Duplicata", yellow "Possivel match"
  - For POSSIBLE_MATCH: show matched existing transaction below for comparison
  - Footer: [Cancel] [Import X selected]

#### `ImportForm` (modified)

- Add 2-step flow:
  1. Step 1: file selection + account + config (existing)
  2. Step 2: preview (new) — shown after previewImport() returns
- State machine: `idle` → `previewing` → `importing` → `done`

### Edge Cases

- File re-parsed on import (not cached server-side) — ensures consistency
- Empty file: show message, no preview
- All duplicates: show preview with all unchecked, disable import button
- Large files (>500 transactions): still show full preview, no pagination needed for MVP

---

## Shared Decisions

- Both features follow existing patterns: server components for pages, server actions for mutations, React Hook Form + Zod for validation
- No new dependencies needed
- No database migrations needed — all queries use existing schema
- Toast notifications used for all success/error feedback (existing ToastProvider)
