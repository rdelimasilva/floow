# Account Drill-down & Import Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add account detail page with filtered transactions, and add import reconciliation UI with per-transaction selection before committing.

**Architecture:** Two independent features sharing no new dependencies. Feature 1 is a new server component page reusing existing components. Feature 2 extends the existing ImportForm with a server-side matching step and client-side selection UI.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, server actions, React Hook Form, existing UI components (TransactionList, TransactionFilters, Pagination, ConfirmDialog, Toast).

---

## Chunk 1: Account Drill-down

### Task 1: Add `getAccountById` query

**Files:**
- Modify: `apps/web/lib/finance/queries.ts`

- [ ] **Step 1: Add `getAccountById` function**

Add after the existing `getAccounts` function (line 40):

```typescript
/**
 * Returns a single account by ID, verifying org ownership.
 * Returns null if account not found or doesn't belong to the org.
 */
export async function getAccountById(orgId: string, accountId: string) {
  const db = getDb()
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
    .limit(1)

  return account ?? null
}
```

- [ ] **Step 2: Verify the app builds**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5` (or `pnpm build` if configured)
Expected: Build succeeds, no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/finance/queries.ts
git commit -m "feat: add getAccountById query for account drill-down"
```

---

### Task 2: Create account drill-down page

**Files:**
- Create: `apps/web/app/(app)/accounts/[accountId]/page.tsx`

- [ ] **Step 1: Create the page file**

```typescript
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Banknote, PiggyBank, TrendingUp, CreditCard, Wallet } from 'lucide-react'
import { getOrgId, getAccountById, getTransactions, getTransactionCount, getCategories } from '@/lib/finance/queries'
import { TransactionList } from '@/components/finance/transaction-list'
import { TransactionFilters } from '@/components/finance/transaction-filters'
import { Pagination } from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'
import { formatBRL } from '@floow/core-finance'

const PAGE_SIZE = 30

const ACCOUNT_TYPE_CONFIG: Record<string, { label: string; Icon: typeof Banknote }> = {
  checking: { label: 'Conta Corrente', Icon: Banknote },
  savings: { label: 'Poupança', Icon: PiggyBank },
  brokerage: { label: 'Corretora', Icon: TrendingUp },
  credit_card: { label: 'Cartão de Crédito', Icon: CreditCard },
  cash: { label: 'Dinheiro', Icon: Wallet },
}

interface Props {
  params: Promise<{ accountId: string }>
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function AccountDetailPage({ params, searchParams }: Props) {
  const { accountId } = await params
  const sp = await searchParams
  const orgId = await getOrgId()

  const account = await getAccountById(orgId, accountId)
  if (!account) notFound()

  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const filters = {
    accountId,
    search: sp.search,
    startDate: sp.startDate,
    endDate: sp.endDate,
  }

  const [transactions, totalCount, categories] = await Promise.all([
    getTransactions(orgId, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...filters }),
    getTransactionCount(orgId, filters),
    getCategories(orgId),
  ])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const paginationParams: Record<string, string> = {}
  if (sp.search) paginationParams.search = sp.search
  if (sp.startDate) paginationParams.startDate = sp.startDate
  if (sp.endDate) paginationParams.endDate = sp.endDate

  const config = ACCOUNT_TYPE_CONFIG[account.type] ?? { label: account.type, Icon: Banknote }
  const { Icon, label } = config
  const isNegative = account.balanceCents < 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/accounts">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{account.name}</h1>
            <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </div>
          </div>
          <p className={`mt-1 text-lg font-semibold ${isNegative ? 'text-red-600' : 'text-green-700'}`}>
            {formatBRL(account.balanceCents)}
          </p>
        </div>
      </div>

      {/* Filters (without account selector) */}
      <TransactionFilters accounts={[]} hideAccountFilter baseUrl={`/accounts/${accountId}`} />

      {/* Transaction count */}
      <p className="text-sm text-gray-500">
        {totalCount > 0 ? `${totalCount} transação(ões)` : 'Nenhuma transação nesta conta'}
      </p>

      {/* Transaction list */}
      <TransactionList
        transactions={transactions}
        accounts={[{ id: account.id, name: account.name }]}
        categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
      />

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        baseUrl={`/accounts/${accountId}`}
        searchParams={paginationParams}
      />
    </div>
  )
}
```

- [ ] **Step 2: Add `hideAccountFilter` and `baseUrl` props to TransactionFilters**

Modify `apps/web/components/finance/transaction-filters.tsx`:

The component currently hardcodes `router.push('/transactions?...')`. Add optional `hideAccountFilter` and `baseUrl` props:

```typescript
interface TransactionFiltersProps {
  accounts: AccountOption[]
  hideAccountFilter?: boolean
  baseUrl?: string
}

export function TransactionFilters({ accounts, hideAccountFilter, baseUrl = '/transactions' }: TransactionFiltersProps) {
```

In `applyFilters()`, change the push target:
```typescript
router.push(`${baseUrl}?${params.toString()}`)
```

In `clearFilters()`:
```typescript
router.push(baseUrl)
```

Hide the account `<select>` when `hideAccountFilter` is true:
```typescript
{!hideAccountFilter && (
  <div className="min-w-[160px]">
    {/* existing account select */}
  </div>
)}
```

- [ ] **Step 3: Verify the app builds**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/accounts/\[accountId\]/page.tsx apps/web/components/finance/transaction-filters.tsx
git commit -m "feat: add account drill-down page with filtered transactions"
```

---

### Task 3: Link AccountCard to drill-down page

**Files:**
- Modify: `apps/web/components/finance/account-card.tsx`

- [ ] **Step 1: Change the "Ver transações" link to point to drill-down**

In `account-card.tsx` line 144-149, change the existing link:

Old:
```typescript
<Link
  href={`/transactions?accountId=${account.id}`}
  className="mt-2 inline-block text-xs text-blue-600 hover:text-blue-800 hover:underline"
>
  Ver transações →
</Link>
```

New:
```typescript
<Link
  href={`/accounts/${account.id}`}
  className="mt-2 inline-block text-xs text-blue-600 hover:text-blue-800 hover:underline"
>
  Ver detalhes →
</Link>
```

- [ ] **Step 2: Verify the app builds**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/finance/account-card.tsx
git commit -m "feat: link account card to drill-down page"
```

---

## Chunk 2: Import Reconciliation

### Task 4: Add `previewImport` server action

**Files:**
- Modify: `apps/web/lib/finance/import-actions.ts`

- [ ] **Step 1: Add types and `previewImport` action**

Add above the existing `importTransactions` function:

```typescript
import { getDb, accounts, transactions } from '@floow/db'
import { eq, and, gte, lte, sql } from 'drizzle-orm'
// (keep existing imports, add gte, lte to drizzle-orm import)

/**
 * Match status for a parsed transaction during import preview.
 */
export type MatchStatus = 'new' | 'duplicate' | 'possible_match'

/**
 * A single item in the import preview — the parsed transaction plus its match status.
 */
export interface PreviewItem {
  index: number
  parsed: {
    date: string        // ISO string for serialization
    description: string
    amountCents: number
    type: 'income' | 'expense'
    externalId: string | null
  }
  status: MatchStatus
  matchedTransaction?: {
    id: string
    date: string
    description: string
    amountCents: number
  }
}

/**
 * Server action: parse an import file and compare against existing transactions.
 * Returns categorized preview items WITHOUT inserting anything.
 *
 * Matching logic:
 * - DUPLICATE: same externalId + same account (exact match via unique index)
 * - POSSIBLE_MATCH: same amountCents + date within ±1 day + same account
 * - NEW: no match found
 */
export async function previewImport(formData: FormData): Promise<PreviewItem[]> {
  const orgId = await getOrgId()
  const db = getDb()

  const file = formData.get('file') as File | null
  if (!file) throw new Error('No file provided')

  const accountId = formData.get('accountId') as string | null
  if (!accountId) throw new Error('No accountId provided')

  const content = await file.text()
  const isOFX = file.name.toLowerCase().endsWith('.ofx')

  const normalized = isOFX
    ? await parseOFXFile(content)
    : parseCSVFile(content, {
        dateColumn: (formData.get('dateColumn') as string) ?? 'Data',
        amountColumn: (formData.get('amountColumn') as string) ?? 'Valor',
        descriptionColumn: (formData.get('descriptionColumn') as string) ?? 'Descricao',
        dateFormat: ((formData.get('dateFormat') as string) ?? 'dd/MM/yyyy') as CsvColumnMapping['dateFormat'],
      })

  if (normalized.length === 0) return []

  // Find date range of parsed transactions (±1 day for fuzzy matching)
  const dates = normalized.map((tx) => tx.date.getTime())
  const minDate = new Date(Math.min(...dates))
  const maxDate = new Date(Math.max(...dates))
  minDate.setDate(minDate.getDate() - 1)
  maxDate.setDate(maxDate.getDate() + 1)

  // Fetch existing transactions in the date range for this account
  const existing = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amountCents: transactions.amountCents,
      externalId: transactions.externalId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        gte(transactions.date, minDate),
        lte(transactions.date, maxDate),
      )
    )

  // Build lookup structures
  const externalIdSet = new Set(existing.filter((t) => t.externalId).map((t) => t.externalId!))

  const items: PreviewItem[] = normalized.map((tx, index) => {
    const parsed = {
      date: tx.date.toISOString(),
      description: tx.description,
      amountCents: tx.amountCents,
      type: tx.type as 'income' | 'expense',
      externalId: tx.externalId,
    }

    // Check exact duplicate by externalId
    if (tx.externalId && externalIdSet.has(tx.externalId)) {
      const matched = existing.find((e) => e.externalId === tx.externalId)
      return {
        index,
        parsed,
        status: 'duplicate' as MatchStatus,
        matchedTransaction: matched
          ? { id: matched.id, date: matched.date.toISOString(), description: matched.description, amountCents: matched.amountCents }
          : undefined,
      }
    }

    // Check possible match by amount + date ±1 day
    const txTime = tx.date.getTime()
    const oneDay = 86400000
    const possibleMatch = existing.find(
      (e) =>
        e.amountCents === tx.amountCents &&
        Math.abs(e.date.getTime() - txTime) <= oneDay
    )

    if (possibleMatch) {
      return {
        index,
        parsed,
        status: 'possible_match' as MatchStatus,
        matchedTransaction: {
          id: possibleMatch.id,
          date: possibleMatch.date.toISOString(),
          description: possibleMatch.description,
          amountCents: possibleMatch.amountCents,
        },
      }
    }

    return { index, parsed, status: 'new' as MatchStatus }
  })

  return items
}
```

- [ ] **Step 2: Add `importSelectedTransactions` action**

Add after `previewImport`:

```typescript
/**
 * Server action: import only the selected transactions from a previously previewed file.
 * Re-parses the file (stateless), filters to selected indices, and inserts with
 * ON CONFLICT DO NOTHING as a safety net.
 */
export async function importSelectedTransactions(formData: FormData): Promise<ImportResult> {
  const orgId = await getOrgId()
  const db = getDb()

  const file = formData.get('file') as File | null
  if (!file) throw new Error('No file provided')

  const accountId = formData.get('accountId') as string | null
  if (!accountId) throw new Error('No accountId provided')

  const selectedIndicesJson = formData.get('selectedIndices') as string | null
  if (!selectedIndicesJson) throw new Error('No selected indices provided')
  const selectedIndices = new Set<number>(JSON.parse(selectedIndicesJson))

  if (selectedIndices.size === 0) return { imported: 0, skipped: 0 }

  const content = await file.text()
  const isOFX = file.name.toLowerCase().endsWith('.ofx')

  const normalized = isOFX
    ? await parseOFXFile(content)
    : parseCSVFile(content, {
        dateColumn: (formData.get('dateColumn') as string) ?? 'Data',
        amountColumn: (formData.get('amountColumn') as string) ?? 'Valor',
        descriptionColumn: (formData.get('descriptionColumn') as string) ?? 'Descricao',
        dateFormat: ((formData.get('dateFormat') as string) ?? 'dd/MM/yyyy') as CsvColumnMapping['dateFormat'],
      })

  // Filter to only selected indices
  const selected = normalized.filter((_, idx) => selectedIndices.has(idx))
  if (selected.length === 0) return { imported: 0, skipped: 0 }

  const importedAt = new Date()
  const rows = selected.map((tx) => ({
    orgId,
    accountId,
    type: tx.type,
    amountCents: tx.amountCents,
    description: tx.description,
    date: tx.date,
    externalId: tx.externalId,
    importedAt,
  }))

  const { imported, skipped } = await db.transaction(async (tx) => {
    const [accountRow] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
      .limit(1)

    if (!accountRow) {
      throw new Error(`Account ${accountId} not found or does not belong to this organization`)
    }

    const insertedRows = await tx
      .insert(transactions)
      .values(rows)
      .onConflictDoNothing({ target: [transactions.externalId, transactions.accountId] })
      .returning({ id: transactions.id, amountCents: transactions.amountCents })

    const importedCount = insertedRows.length
    const skippedCount = selected.length - importedCount

    if (importedCount > 0) {
      const totalDelta = insertedRows.reduce((sum, row) => sum + row.amountCents, 0)
      if (totalDelta !== 0) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${totalDelta}` })
          .where(eq(accounts.id, accountId))
      }
    }

    return { imported: importedCount, skipped: skippedCount }
  })

  revalidatePath('/transactions')
  revalidatePath('/accounts')

  return { imported, skipped }
}
```

- [ ] **Step 3: Verify the app builds**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds, no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/finance/import-actions.ts
git commit -m "feat: add previewImport and importSelectedTransactions server actions"
```

---

### Task 5: Create ImportPreview component

**Files:**
- Create: `apps/web/components/finance/import-preview.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PreviewItem, MatchStatus } from '@/lib/finance/import-actions'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(iso))
}

const STATUS_CONFIG: Record<MatchStatus, { label: string; color: string; defaultChecked: boolean }> = {
  new: { label: 'Nova', color: 'bg-green-100 text-green-800', defaultChecked: true },
  duplicate: { label: 'Duplicata', color: 'bg-gray-100 text-gray-600', defaultChecked: false },
  possible_match: { label: 'Possível match', color: 'bg-yellow-100 text-yellow-800', defaultChecked: true },
}

interface ImportPreviewProps {
  items: PreviewItem[]
  onConfirm: (selectedIndices: number[]) => void
  onCancel: () => void
  loading: boolean
}

export function ImportPreview({ items, onConfirm, onCancel, loading }: ImportPreviewProps) {
  const [selected, setSelected] = useState<Set<number>>(() => {
    const initial = new Set<number>()
    for (const item of items) {
      if (STATUS_CONFIG[item.status].defaultChecked) {
        initial.add(item.index)
      }
    }
    return initial
  })

  const counts = useMemo(() => {
    const c = { new: 0, duplicate: 0, possible_match: 0 }
    for (const item of items) c[item.status]++
    return c
  }, [items])

  function toggleItem(index: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleAllByStatus(status: MatchStatus) {
    const statusItems = items.filter((i) => i.status === status)
    const allSelected = statusItems.every((i) => selected.has(i.index))

    setSelected((prev) => {
      const next = new Set(prev)
      for (const item of statusItems) {
        if (allSelected) next.delete(item.index)
        else next.add(item.index)
      }
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3">
        {counts.new > 0 && (
          <button
            type="button"
            onClick={() => toggleAllByStatus('new')}
            className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800 hover:bg-green-100"
          >
            <span>{counts.new} novas</span>
          </button>
        )}
        {counts.duplicate > 0 && (
          <button
            type="button"
            onClick={() => toggleAllByStatus('duplicate')}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <span>{counts.duplicate} duplicatas</span>
          </button>
        )}
        {counts.possible_match > 0 && (
          <button
            type="button"
            onClick={() => toggleAllByStatus('possible_match')}
            className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm font-medium text-yellow-800 hover:bg-yellow-100"
          >
            <span>{counts.possible_match} possíveis matches</span>
          </button>
        )}
      </div>

      {/* Preview table */}
      <div className="rounded-md border overflow-auto max-h-[500px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.index}
                className={item.status === 'duplicate' ? 'opacity-50' : ''}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(item.index)}
                    onChange={() => toggleItem(item.index)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDate(item.parsed.date)}
                </TableCell>
                <TableCell className="max-w-xs text-sm">
                  <div className="truncate">{item.parsed.description || '—'}</div>
                  {item.status === 'possible_match' && item.matchedTransaction && (
                    <div className="mt-1 truncate text-xs text-yellow-700">
                      Match: {item.matchedTransaction.description} ({formatDate(item.matchedTransaction.date)})
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap text-sm">
                  <span className={item.parsed.amountCents >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatCents(item.parsed.amountCents)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[item.status].color}`}>
                    {STATUS_CONFIG[item.status].label}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{selected.size} selecionadas de {items.length}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(Array.from(selected))} disabled={loading || selected.size === 0}>
            {loading ? 'Importando...' : `Importar ${selected.size} transação${selected.size !== 1 ? 'es' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the app builds**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/finance/import-preview.tsx
git commit -m "feat: add ImportPreview component with per-transaction selection"
```

---

### Task 6: Integrate reconciliation into ImportForm

**Files:**
- Modify: `apps/web/components/finance/import-form.tsx`

- [ ] **Step 1: Update imports and add new state**

Add to existing imports at the top of `import-form.tsx`:

```typescript
import { previewImport, importSelectedTransactions, type PreviewItem } from '@/lib/finance/import-actions'
import { ImportPreview } from './import-preview'
```

Update the `Step` type to include the reconciliation step:

```typescript
type Step = 'select-file' | 'preview' | 'reconciliation' | 'importing' | 'done'
```

Add new state after the existing state declarations:

```typescript
const [previewItems, setPreviewItems] = useState<PreviewItem[]>([])
```

- [ ] **Step 2: Replace `handleImport` and add `handlePreviewWithReconciliation`**

Replace the existing `handleImport` function with two functions:

```typescript
// After file preview, run server-side reconciliation
async function handleReconciliation() {
  if (!selectedFile || !selectedAccountId) return
  setError(null)

  try {
    const formData = new FormData()
    formData.set('file', selectedFile)
    formData.set('accountId', selectedAccountId)

    const isCSV = !selectedFile.name.toLowerCase().endsWith('.ofx')
    if (isCSV) {
      formData.set('dateColumn', csvMapping.dateColumn)
      formData.set('amountColumn', csvMapping.amountColumn)
      formData.set('descriptionColumn', csvMapping.descriptionColumn)
      formData.set('dateFormat', csvMapping.dateFormat)
    }

    const items = await previewImport(formData)
    setPreviewItems(items)
    setStep('reconciliation')
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Erro ao analisar transações')
  }
}

async function handleImportSelected(selectedIndices: number[]) {
  if (!selectedFile || !selectedAccountId) return
  setStep('importing')
  setError(null)

  try {
    const formData = new FormData()
    formData.set('file', selectedFile)
    formData.set('accountId', selectedAccountId)
    formData.set('selectedIndices', JSON.stringify(selectedIndices))

    const isCSV = !selectedFile.name.toLowerCase().endsWith('.ofx')
    if (isCSV) {
      formData.set('dateColumn', csvMapping.dateColumn)
      formData.set('amountColumn', csvMapping.amountColumn)
      formData.set('descriptionColumn', csvMapping.descriptionColumn)
      formData.set('dateFormat', csvMapping.dateFormat)
    }

    const importResult = await importSelectedTransactions(formData)
    setResult(importResult)
    setStep('done')
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Erro ao importar transações')
    setStep('reconciliation')
  }
}
```

- [ ] **Step 3: Update the preview step button to call reconciliation**

In the preview step's button area (around line 406), change:

Old:
```typescript
<Button onClick={handleImport} disabled={preview.length === 0}>
  Importar {preview.length} transação{preview.length !== 1 ? 'es' : ''}
</Button>
```

New:
```typescript
<Button onClick={handleReconciliation} disabled={preview.length === 0}>
  Verificar duplicatas
</Button>
```

- [ ] **Step 4: Add reconciliation step rendering**

Add a new step block between the `preview` and `importing` sections:

```typescript
{/* Step 2.5: Reconciliation */}
{step === 'reconciliation' && (
  <ImportPreview
    items={previewItems}
    onConfirm={handleImportSelected}
    onCancel={handleReset}
    loading={false}
  />
)}
```

- [ ] **Step 5: Add `previewItems` to the reset handler**

In `handleReset`, add:
```typescript
setPreviewItems([])
```

- [ ] **Step 6: Verify the app builds**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/finance/import-form.tsx
git commit -m "feat: integrate import reconciliation with preview and selection"
```

---

### Task 7: Manual testing and cleanup

- [ ] **Step 1: Test account drill-down**

1. Navigate to `/accounts`
2. Click "Ver detalhes" on any account
3. Verify: account header shows name, type, balance
4. Verify: transactions are filtered to that account
5. Verify: search and date filters work
6. Verify: pagination works
7. Verify: back button returns to `/accounts`

- [ ] **Step 2: Test import reconciliation**

1. Navigate to `/transactions/import`
2. Select a file and account
3. Verify: preview shows parsed transactions
4. Click "Verificar duplicatas"
5. Verify: reconciliation view shows items categorized as new/duplicate/possible_match
6. Verify: checkboxes work (toggle individual + toggle by category)
7. Verify: import selected works and shows correct counts
8. Test with a file that has known duplicates to verify matching

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: account drill-down and import reconciliation complete"
```
