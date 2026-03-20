# Transaction Filters & Column Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add period shortcut buttons, column sorting, and column filters (type, category, amount range) to the transactions page.

**Architecture:** Period shortcuts compute date ranges client-side and set URL search params. Column headers become interactive — click to sort, funnel icon to filter. All state lives in URL params for shareability. Backend queries accept sort and filter params.

**Tech Stack:** Next.js App Router, Drizzle ORM, React, Tailwind CSS, lucide-react

**Spec:** `docs/superpowers/specs/2026-03-20-transaction-filters-design.md`

---

## File Structure

### New files
- `apps/web/components/finance/sortable-header.tsx` — reusable column header with sort + filter dropdown
- `apps/web/components/finance/column-filter-dropdown.tsx` — dropdown with TypeFilter, CategoryFilter, AmountFilter

### Modified files
- `apps/web/lib/finance/queries.ts` — add sort + column filter params to `getTransactions` and `getTransactionCount`
- `apps/web/components/finance/transaction-filters.tsx` — add period shortcut buttons
- `apps/web/components/finance/transaction-list.tsx` — replace static headers with SortableHeader, wire sort/filter state
- `apps/web/app/(app)/transactions/page.tsx` — read new URL params, pass to queries and components

---

## Task 1: Backend — sort and column filter params in queries

**Files:**
- Modify: `apps/web/lib/finance/queries.ts`

- [ ] **Step 1: Update `getTransactions` signature and sort logic**

Add `sortBy`, `sortDir`, `types`, `categoryIds`, `minAmount`, `maxAmount` to the opts parameter. Add sorting and filtering logic.

The current function signature:
```typescript
export async function getTransactions(
  orgId: string,
  opts?: { limit?: number; offset?: number; accountId?: string; search?: string; startDate?: string; endDate?: string }
)
```

Change to:
```typescript
export async function getTransactions(
  orgId: string,
  opts?: {
    limit?: number; offset?: number; accountId?: string; search?: string;
    startDate?: string; endDate?: string;
    sortBy?: string; sortDir?: string;
    types?: string; categoryIds?: string;
    minAmount?: number; maxAmount?: number;
  }
)
```

Add new imports at top — `inArray` and `asc` from `drizzle-orm`:
```typescript
import { eq, and, desc, asc, isNull, or, gte, count, ilike, lte, inArray } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
```

After the existing filter conditions block, add:

```typescript
  // Column filters
  if (opts?.types) {
    const typeList = opts.types.split(',').filter(Boolean) as ('income' | 'expense' | 'transfer')[]
    if (typeList.length > 0) conditions.push(inArray(transactions.type, typeList))
  }
  if (opts?.categoryIds) {
    const catList = opts.categoryIds.split(',').filter(Boolean)
    if (catList.length > 0) conditions.push(inArray(transactions.categoryId, catList))
  }
  if (opts?.minAmount !== undefined) {
    conditions.push(sql`ABS(${transactions.amountCents}) >= ${opts.minAmount}`)
  }
  if (opts?.maxAmount !== undefined) {
    conditions.push(sql`ABS(${transactions.amountCents}) <= ${opts.maxAmount}`)
  }
```

Replace the `.orderBy(desc(transactions.balanceApplied), desc(transactions.date))` with dynamic sorting:

```typescript
  // Dynamic sort — always keep balanceApplied DESC first (applied before future)
  const sortColumns: Record<string, any> = {
    date: transactions.date,
    description: transactions.description,
    categoryName: categories.name,
    type: transactions.type,
    amountCents: transactions.amountCents,
  }
  const sortCol = sortColumns[opts?.sortBy ?? 'date'] ?? transactions.date
  const sortFn = opts?.sortDir === 'asc' ? asc : desc

  // ... in the query chain:
  .orderBy(desc(transactions.balanceApplied), sortFn(sortCol))
```

- [ ] **Step 2: Update `getTransactionCount` with the same column filters**

Add the same `types`, `categoryIds`, `minAmount`, `maxAmount` params to `getTransactionCount` opts and the same condition-building logic. No sort needed for count.

Current signature:
```typescript
export async function getTransactionCount(
  orgId: string,
  opts?: { accountId?: string; search?: string; startDate?: string; endDate?: string }
)
```

Change to:
```typescript
export async function getTransactionCount(
  orgId: string,
  opts?: {
    accountId?: string; search?: string; startDate?: string; endDate?: string;
    types?: string; categoryIds?: string; minAmount?: number; maxAmount?: number;
  }
)
```

Add the same column filter conditions (types, categoryIds, minAmount, maxAmount) after the existing conditions.

Note: `getTransactionCount` does NOT join with `categories`, so `categoryIds` filter uses `transactions.categoryId` with `inArray` which works without a join. But `sql` needs to be imported.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/finance/queries.ts
git commit -m "feat: add sort and column filter params to transaction queries"
```

---

## Task 2: Period shortcut buttons in transaction-filters.tsx

**Files:**
- Modify: `apps/web/components/finance/transaction-filters.tsx`

- [ ] **Step 1: Add period helper functions and constants**

Add before the component:

```typescript
type PeriodKey = 'today' | 'month' | 'quarter' | 'semester' | 'year'

const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Hoje',
  month: 'Este mês',
  quarter: 'Este trimestre',
  semester: 'Este semestre',
  year: 'Este ano',
}

function getPeriodDates(key: PeriodKey): { startDate: string; endDate: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-based

  const fmt = (d: Date) => d.toISOString().split('T')[0]

  switch (key) {
    case 'today':
      return { startDate: fmt(now), endDate: fmt(now) }
    case 'month':
      return { startDate: fmt(new Date(y, m, 1)), endDate: fmt(new Date(y, m + 1, 0)) }
    case 'quarter': {
      const q = Math.floor(m / 3)
      return { startDate: fmt(new Date(y, q * 3, 1)), endDate: fmt(new Date(y, q * 3 + 3, 0)) }
    }
    case 'semester': {
      const s = m < 6 ? 0 : 1
      return { startDate: fmt(new Date(y, s * 6, 1)), endDate: fmt(new Date(y, s * 6 + 6, 0)) }
    }
    case 'year':
      return { startDate: fmt(new Date(y, 0, 1)), endDate: fmt(new Date(y, 11, 31)) }
  }
}

function detectActivePeriod(startDate: string, endDate: string): PeriodKey | null {
  for (const key of Object.keys(PERIOD_LABELS) as PeriodKey[]) {
    const { startDate: s, endDate: e } = getPeriodDates(key)
    if (s === startDate && e === endDate) return key
  }
  return null
}
```

- [ ] **Step 2: Add the period buttons JSX**

Inside the component, compute the active period:
```typescript
  const activePeriod = detectActivePeriod(startDate, endDate)
```

Add a row of period buttons BEFORE the existing `<div className="flex flex-wrap items-center gap-2">`. Wrap everything in a parent `<div className="space-y-2">`:

```tsx
    <div className="space-y-2">
      {/* Period shortcuts */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              const { startDate: s, endDate: e } = getPeriodDates(key)
              setStartDate(s)
              setEndDate(e)
              navigate({ startDate: s, endDate: e })
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activePeriod === key
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {PERIOD_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Existing filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* ... existing search, account, date range, clear filters ... */}
      </div>
    </div>
```

Make sure `clearFilters` also resets the period (it already clears startDate/endDate which achieves this).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/finance/transaction-filters.tsx
git commit -m "feat: add period shortcut buttons to transaction filters"
```

---

## Task 3: SortableHeader component

**Files:**
- Create: `apps/web/components/finance/sortable-header.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown, Filter } from 'lucide-react'

interface SortableHeaderProps {
  label: string
  sortKey: string
  currentSortBy: string
  currentSortDir: 'asc' | 'desc'
  onSort: (sortKey: string) => void
  filterContent?: React.ReactNode
  hasActiveFilter?: boolean
  className?: string
}

export function SortableHeader({
  label,
  sortKey,
  currentSortBy,
  currentSortDir,
  onSort,
  filterContent,
  hasActiveFilter,
  className = '',
}: SortableHeaderProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isActive = currentSortBy === sortKey
  const SortIcon = currentSortDir === 'asc' ? ChevronUp : ChevronDown

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [filterOpen])

  return (
    <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 ${className}`}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className="flex items-center gap-0.5 hover:text-gray-700 transition-colors"
        >
          {label}
          {isActive && <SortIcon className="h-3.5 w-3.5" />}
        </button>

        {filterContent && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setFilterOpen(!filterOpen)}
              className={`rounded p-0.5 transition-colors ${
                hasActiveFilter ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Filter className="h-3 w-3" />
            </button>
            {filterOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                {filterContent}
              </div>
            )}
          </div>
        )}
      </div>
    </th>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/finance/sortable-header.tsx
git commit -m "feat: create SortableHeader component"
```

---

## Task 4: Column filter dropdowns

**Files:**
- Create: `apps/web/components/finance/column-filter-dropdown.tsx`

- [ ] **Step 1: Create the filter components**

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { currencyToCents, formatBRL } from '@floow/core-finance'

// ── Type Filter ─────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'income', label: 'Receita' },
  { value: 'expense', label: 'Despesa' },
  { value: 'transfer', label: 'Transferência' },
] as const

interface TypeFilterProps {
  selected: string[]
  onChange: (types: string[]) => void
}

export function TypeFilter({ selected, onChange }: TypeFilterProps) {
  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-500">Tipo</p>
      {TYPE_OPTIONS.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            className="rounded border-gray-300"
          />
          {opt.label}
        </label>
      ))}
    </div>
  )
}

// ── Category Filter ─────────────────────────────────────────

interface CategoryOption {
  id: string
  name: string
}

interface CategoryFilterProps {
  categories: CategoryOption[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export function CategoryFilter({ categories, selected, onChange }: CategoryFilterProps) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((v) => v !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-500">Categoria</p>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {categories.map((cat) => (
          <label key={cat.id} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(cat.id)}
              onChange={() => toggle(cat.id)}
              className="rounded border-gray-300"
            />
            {cat.name}
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Amount Filter ───────────────────────────────────────────

interface AmountFilterProps {
  minAmount: string
  maxAmount: string
  onApply: (min: string, max: string) => void
}

export function AmountFilter({ minAmount: initialMin, maxAmount: initialMax, onApply }: AmountFilterProps) {
  const [min, setMin] = useState(initialMin)
  const [max, setMax] = useState(initialMax)

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500">Valor (R$)</p>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          placeholder="Mín"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="h-7 text-xs w-20"
        />
        <span className="text-xs text-gray-400">a</span>
        <Input
          type="text"
          placeholder="Máx"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="h-7 text-xs w-20"
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="primary"
        onClick={() => onApply(min, max)}
        className="h-7 text-xs w-full"
      >
        Aplicar
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/finance/column-filter-dropdown.tsx
git commit -m "feat: create column filter dropdown components"
```

---

## Task 5: Wire everything in transaction-list.tsx

**Files:**
- Modify: `apps/web/components/finance/transaction-list.tsx`

- [ ] **Step 1: Add new props to TransactionListProps**

```typescript
interface TransactionListProps {
  transactions: TransactionRow[]
  accounts: AccountOption[]
  categories: CategoryOption[]
  // New sort/filter props
  sortBy: string
  sortDir: 'asc' | 'desc'
  activeTypes: string[]
  activeCategoryIds: string[]
  activeMinAmount: string
  activeMaxAmount: string
  onSort: (sortKey: string) => void
  onFilterTypes: (types: string[]) => void
  onFilterCategories: (ids: string[]) => void
  onFilterAmount: (min: string, max: string) => void
}
```

- [ ] **Step 2: Add imports**

```typescript
import { SortableHeader } from '@/components/finance/sortable-header'
import { TypeFilter, CategoryFilter, AmountFilter } from '@/components/finance/column-filter-dropdown'
```

- [ ] **Step 3: Replace static `<thead>` with SortableHeader components**

Replace the entire `<thead>` section with:

```tsx
          <thead className="bg-gray-50">
            <tr>
              <SortableHeader
                label="Data"
                sortKey="date"
                currentSortBy={sortBy}
                currentSortDir={sortDir}
                onSort={onSort}
              />
              <SortableHeader
                label="Descrição"
                sortKey="description"
                currentSortBy={sortBy}
                currentSortDir={sortDir}
                onSort={onSort}
              />
              <SortableHeader
                label="Categoria"
                sortKey="categoryName"
                currentSortBy={sortBy}
                currentSortDir={sortDir}
                onSort={onSort}
                hasActiveFilter={activeCategoryIds.length > 0}
                filterContent={
                  <CategoryFilter
                    categories={categories}
                    selected={activeCategoryIds}
                    onChange={onFilterCategories}
                  />
                }
              />
              <SortableHeader
                label="Tipo"
                sortKey="type"
                currentSortBy={sortBy}
                currentSortDir={sortDir}
                onSort={onSort}
                hasActiveFilter={activeTypes.length > 0}
                filterContent={
                  <TypeFilter
                    selected={activeTypes}
                    onChange={onFilterTypes}
                  />
                }
              />
              <SortableHeader
                label="Valor"
                sortKey="amountCents"
                currentSortBy={sortBy}
                currentSortDir={sortDir}
                onSort={onSort}
                hasActiveFilter={!!activeMinAmount || !!activeMaxAmount}
                filterContent={
                  <AmountFilter
                    minAmount={activeMinAmount}
                    maxAmount={activeMaxAmount}
                    onApply={onFilterAmount}
                  />
                }
                className="text-right"
              />
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Ações</th>
            </tr>
          </thead>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/finance/transaction-list.tsx
git commit -m "feat: wire sortable headers and column filters in transaction list"
```

---

## Task 6: Wire page.tsx — read URL params, connect everything

**Files:**
- Modify: `apps/web/app/(app)/transactions/page.tsx`

- [ ] **Step 1: Read new search params and pass to queries**

Update the filters object:

```typescript
  const filters = {
    accountId: params.accountId,
    search: params.search,
    startDate: params.startDate,
    endDate: params.endDate,
    sortBy: params.sortBy ?? 'date',
    sortDir: params.sortDir ?? 'desc',
    types: params.types,
    categoryIds: params.categoryIds,
    minAmount: params.minAmount ? parseInt(params.minAmount, 10) : undefined,
    maxAmount: params.maxAmount ? parseInt(params.maxAmount, 10) : undefined,
  }
```

Pass sort params to `getTransactions`:
```typescript
  const [transactions, totalCount, accounts, categories] = await Promise.all([
    getTransactions(orgId, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...filters }),
    getTransactionCount(orgId, filters),
    getAccounts(orgId),
    getCategories(orgId),
  ])
```

- [ ] **Step 2: Create a client wrapper for sort/filter navigation**

Since the page is a server component but sort/filter interactions happen client-side, create a small client component at the top of page.tsx (or in a separate file). The simplest approach: make `TransactionList` handle navigation internally using `useRouter` and `useSearchParams`.

Actually, the cleanest approach is to have the `TransactionList` receive the current filter state as props and handle navigation internally. Add a wrapper:

Create a new client component `apps/web/components/finance/transaction-list-wrapper.tsx`:

```typescript
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { TransactionList } from './transaction-list'
import { currencyToCents } from '@floow/core-finance'

interface Props {
  transactions: Parameters<typeof TransactionList>[0]['transactions']
  accounts: Parameters<typeof TransactionList>[0]['accounts']
  categories: Parameters<typeof TransactionList>[0]['categories']
  sortBy: string
  sortDir: 'asc' | 'desc'
}

export function TransactionListWrapper({ transactions, accounts, categories, sortBy, sortDir }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const navigate = useCallback((overrides: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    params.set('page', '1')
    router.push(`/transactions?${params.toString()}`)
  }, [router, searchParams])

  const activeTypes = (searchParams.get('types') ?? '').split(',').filter(Boolean)
  const activeCategoryIds = (searchParams.get('categoryIds') ?? '').split(',').filter(Boolean)
  const activeMinAmount = searchParams.get('minAmount') ?? ''
  const activeMaxAmount = searchParams.get('maxAmount') ?? ''

  return (
    <TransactionList
      transactions={transactions}
      accounts={accounts}
      categories={categories}
      sortBy={sortBy}
      sortDir={sortDir}
      activeTypes={activeTypes}
      activeCategoryIds={activeCategoryIds}
      activeMinAmount={activeMinAmount}
      activeMaxAmount={activeMaxAmount}
      onSort={(key) => {
        const newDir = sortBy === key && sortDir === 'desc' ? 'asc' : 'desc'
        navigate({ sortBy: key, sortDir: newDir })
      }}
      onFilterTypes={(types) => navigate({ types: types.join(',') })}
      onFilterCategories={(ids) => navigate({ categoryIds: ids.join(',') })}
      onFilterAmount={(min, max) => {
        const minCents = min ? String(currencyToCents(min)) : ''
        const maxCents = max ? String(currencyToCents(max)) : ''
        navigate({ minAmount: minCents, maxAmount: maxCents })
      }}
    />
  )
}
```

- [ ] **Step 3: Update page.tsx to use the wrapper**

Replace the `<TransactionList>` usage with `<TransactionListWrapper>`:

```typescript
import { TransactionListWrapper } from '@/components/finance/transaction-list-wrapper'
```

```tsx
      <TransactionListWrapper
        transactions={transactions.map((t) => ({
          ...t,
          isAutoCategorized: t.isAutoCategorized,
        }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
        sortBy={filters.sortBy}
        sortDir={filters.sortDir as 'asc' | 'desc'}
      />
```

Update `paginationParams` to include new filter params:

```typescript
  const paginationParams: Record<string, string> = {}
  if (filters.accountId) paginationParams.accountId = filters.accountId
  if (filters.search) paginationParams.search = filters.search
  if (filters.startDate) paginationParams.startDate = filters.startDate
  if (filters.endDate) paginationParams.endDate = filters.endDate
  if (filters.sortBy && filters.sortBy !== 'date') paginationParams.sortBy = filters.sortBy
  if (filters.sortDir && filters.sortDir !== 'desc') paginationParams.sortDir = filters.sortDir
  if (params.types) paginationParams.types = params.types
  if (params.categoryIds) paginationParams.categoryIds = params.categoryIds
  if (params.minAmount) paginationParams.minAmount = params.minAmount
  if (params.maxAmount) paginationParams.maxAmount = params.maxAmount
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/finance/transaction-list-wrapper.tsx apps/web/app/(app)/transactions/page.tsx
git commit -m "feat: wire sort and column filters in transactions page"
```

---

## Task 7: Verify end-to-end

- [ ] **Step 1: Build check**

Run: `cd apps/web && npx next build --no-lint`
Expected: Build passes

- [ ] **Step 2: Manual test — period shortcuts**

1. Go to /transactions
2. Click "Este mês" — URL updates with startDate/endDate, only current month transactions show
3. Click "Hoje" — only today's transactions
4. Click "Este ano" — full year
5. Click "Limpar filtros" — resets

- [ ] **Step 3: Manual test — column sorting**

1. Click "Valor" header — sorts by amount DESC
2. Click again — sorts ASC
3. Click "Data" — back to date sort

- [ ] **Step 4: Manual test — column filters**

1. Click funnel on "Tipo" — checkboxes appear, select only "Despesa" — list filters
2. Click funnel on "Categoria" — select a category — list filters further
3. Click funnel on "Valor" — enter min/max — applies

- [ ] **Step 5: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
