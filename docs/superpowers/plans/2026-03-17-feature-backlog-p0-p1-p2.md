# Feature Backlog Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full CRUD operations, filtering, pagination, toast notifications, and UX polish to the Floow financial app — transforming it from a data-entry tool into a usable financial management app.

**Architecture:** Each feature follows the existing pattern: Zod schema (shared) → server action (lib/) → UI component (components/) → page integration (app/). All mutations use `db.transaction()` with atomic balance updates via `sql\`balance_cents + ${delta}\``. A global toast context provides success/error feedback across all actions.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, Supabase Auth, React Hook Form + Zod, Radix UI + Tailwind CSS, lucide-react icons.

---

## Chunk 1: Global Toast System

This is the foundation — all other features depend on it for user feedback.

### Task 1.1: Create Toast Context & UI Component

**Files:**
- Create: `apps/web/components/ui/toast.tsx`
- Create: `apps/web/components/providers/toast-provider.tsx`
- Modify: `apps/web/app/(app)/layout.tsx`

- [ ] **Step 1: Create the Toast UI component**

Create `apps/web/components/ui/toast.tsx`:

```tsx
'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — fixed bottom-right */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all animate-in slide-in-from-right ${
              t.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : t.type === 'error'
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
            }`}
          >
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="ml-2 text-current opacity-60 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
```

- [ ] **Step 2: Create ToastProvider wrapper**

Create `apps/web/components/providers/toast-provider.tsx`:

```tsx
'use client'

export { ToastProvider } from '@/components/ui/toast'
```

- [ ] **Step 3: Add ToastProvider to the app layout**

Modify `apps/web/app/(app)/layout.tsx` — wrap `{children}` with `<ToastProvider>`:

```tsx
import { ToastProvider } from '@/components/providers/toast-provider'

// Inside the layout component, wrap children:
<ToastProvider>
  {children}
</ToastProvider>
```

- [ ] **Step 4: Verify the toast renders**

Start the dev server, navigate to any page, and verify no errors. The toast container should be invisible (no toasts yet).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/toast.tsx apps/web/components/providers/toast-provider.tsx apps/web/app/\(app\)/layout.tsx
git commit -m "feat: add global toast notification system"
```

---

## Chunk 2: Delete & Edit Account

### Task 2.1: Add Zod schemas for update/delete

**Files:**
- Modify: `packages/shared/src/schemas/finance.ts`

- [ ] **Step 1: Add updateAccountSchema to shared schemas**

Append to `packages/shared/src/schemas/finance.ts`:

```ts
export const updateAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.enum(['checking', 'savings', 'brokerage', 'credit_card', 'cash']),
})

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/schemas/finance.ts
git commit -m "feat: add updateAccountSchema to shared schemas"
```

### Task 2.2: Add server actions for update & delete account

**Files:**
- Modify: `apps/web/lib/finance/actions.ts`

- [ ] **Step 1: Add updateAccount server action**

Add to `apps/web/lib/finance/actions.ts` (import `updateAccountSchema` from `@floow/shared`):

```ts
export async function updateAccount(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const input = updateAccountSchema.parse({
    id: formData.get('id'),
    name: formData.get('name'),
    type: formData.get('type'),
  })

  await assertAccountOwnership(db, input.id, orgId)

  const [updated] = await db
    .update(accounts)
    .set({ name: input.name, type: input.type, updatedAt: new Date() })
    .where(and(eq(accounts.id, input.id), eq(accounts.orgId, orgId)))
    .returning()

  revalidatePath('/accounts')
  revalidatePath('/dashboard')

  return updated
}
```

- [ ] **Step 2: Add deleteAccount server action**

Add to `apps/web/lib/finance/actions.ts`:

```ts
export async function deleteAccount(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const accountId = formData.get('id') as string
  if (!accountId) throw new Error('Account ID is required')

  await assertAccountOwnership(db, accountId, orgId)

  // Soft-delete: set isActive = false (preserves transaction history)
  const [updated] = await db
    .update(accounts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
    .returning()

  revalidatePath('/accounts')
  revalidatePath('/dashboard')
  revalidatePath('/transactions')

  return updated
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/finance/actions.ts
git commit -m "feat: add updateAccount and deleteAccount server actions"
```

### Task 2.3: Create ConfirmDialog reusable component

**Files:**
- Create: `apps/web/components/ui/confirm-dialog.tsx`

- [ ] **Step 1: Create the confirm dialog component**

Create `apps/web/components/ui/confirm-dialog.tsx`:

```tsx
'use client'

import { useRef, useEffect, type ReactNode } from 'react'
import { Button } from './button'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  loading = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="w-[400px] p-6">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {loading ? 'Aguarde...' : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/ui/confirm-dialog.tsx
git commit -m "feat: add reusable ConfirmDialog component"
```

### Task 2.4: Create AccountCard with edit/delete actions

**Files:**
- Modify: `apps/web/components/finance/account-card.tsx`

- [ ] **Step 1: Rewrite AccountCard as client component with edit/delete**

Rewrite `apps/web/components/finance/account-card.tsx` to add inline edit form and delete confirmation:

```tsx
'use client'

import { useState } from 'react'
import { Banknote, PiggyBank, TrendingUp, CreditCard, Wallet, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatBRL } from '@floow/core-finance'
import { updateAccount, deleteAccount } from '@/lib/finance/actions'
import { useToast } from '@/components/ui/toast'
import type { Account } from '@floow/db'

const ACCOUNT_TYPE_CONFIG = {
  checking: { label: 'Conta Corrente', Icon: Banknote },
  savings: { label: 'Poupança', Icon: PiggyBank },
  brokerage: { label: 'Corretora', Icon: TrendingUp },
  credit_card: { label: 'Cartão de Crédito', Icon: CreditCard },
  cash: { label: 'Dinheiro', Icon: Wallet },
} as const

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Conta Corrente' },
  { value: 'savings', label: 'Poupança' },
  { value: 'brokerage', label: 'Corretora' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'cash', label: 'Dinheiro' },
] as const

interface AccountCardProps {
  account: Account
}

export function AccountCard({ account }: AccountCardProps) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(account.name)
  const [type, setType] = useState(account.type)

  const config = ACCOUNT_TYPE_CONFIG[account.type]
  const { Icon, label } = config
  const isNegative = account.balanceCents < 0

  async function handleUpdate() {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', account.id)
      formData.append('name', name)
      formData.append('type', type)
      await updateAccount(formData)
      setEditing(false)
      toast('Conta atualizada com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar conta', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', account.id)
      await deleteAccount(formData)
      setConfirmDelete(false)
      toast('Conta removida com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao remover conta', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (editing) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleUpdate} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setName(account.name); setType(account.type) }}>
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-gray-600">{account.name}</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold tracking-tight ${isNegative ? 'text-red-600' : 'text-green-700'}`}>
            {formatBRL(account.balanceCents)}
          </p>
          <p className="mt-1 text-xs text-gray-400">{account.currency}</p>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Remover conta"
        description={`Tem certeza que deseja remover "${account.name}"? A conta será desativada e não aparecerá mais na listagem. As transações associadas serão mantidas.`}
        confirmLabel="Remover"
        loading={loading}
      />
    </>
  )
}
```

- [ ] **Step 2: Verify accounts page renders with edit/delete buttons**

Navigate to `/accounts`, confirm cards show edit (pencil) and delete (trash) icons.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/finance/account-card.tsx
git commit -m "feat: add inline edit and delete to AccountCard with toast feedback"
```

---

## Chunk 3: Delete & Edit Transaction

### Task 3.1: Add server actions for update & delete transaction

**Files:**
- Modify: `apps/web/lib/finance/actions.ts`
- Modify: `packages/shared/src/schemas/finance.ts`

- [ ] **Step 1: Add updateTransactionSchema to shared schemas**

Append to `packages/shared/src/schemas/finance.ts`:

```ts
export const updateTransactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(['income', 'expense', 'transfer']),
  amountCents: z.number().int().positive(),
  description: z.string().min(1).max(500),
  date: z.coerce.date(),
})

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>
```

- [ ] **Step 2: Add deleteTransaction server action**

Add to `apps/web/lib/finance/actions.ts`:

```ts
/**
 * Server action: delete a transaction and reverse its balance impact.
 *
 * For transfers: deletes both legs (source + destination) using transferGroupId.
 * For income/expense: deletes single row and reverses the balance delta.
 *
 * CRITICAL: Uses sql`balance_cents + ${-amountCents}` for atomic balance reversal.
 */
export async function deleteTransaction(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const transactionId = formData.get('id') as string
  if (!transactionId) throw new Error('Transaction ID is required')

  // Fetch the transaction to know its balance impact
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))
    .limit(1)

  if (!tx) throw new Error('Transaction not found')

  await db.transaction(async (dbTx) => {
    if (tx.transferGroupId) {
      // Transfer: delete both legs and reverse both balances
      const legs = await dbTx
        .select()
        .from(transactions)
        .where(and(eq(transactions.transferGroupId, tx.transferGroupId), eq(transactions.orgId, orgId)))

      for (const leg of legs) {
        // Reverse the balance impact
        await dbTx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${-leg.amountCents}` })
          .where(eq(accounts.id, leg.accountId))
      }

      // Delete all legs
      await dbTx
        .delete(transactions)
        .where(and(eq(transactions.transferGroupId, tx.transferGroupId), eq(transactions.orgId, orgId)))
    } else {
      // Income/expense: reverse balance and delete
      await dbTx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${-tx.amountCents}` })
        .where(eq(accounts.id, tx.accountId))

      await dbTx
        .delete(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))
    }
  })

  revalidatePath('/transactions')
  revalidatePath('/accounts')
  revalidatePath('/dashboard')
}
```

- [ ] **Step 3: Add updateTransaction server action**

Add to `apps/web/lib/finance/actions.ts` (import `updateTransactionSchema` from `@floow/shared`):

```ts
/**
 * Server action: update a non-transfer transaction.
 * Reverses old balance impact and applies new one atomically.
 * Transfer edits are not supported (delete + recreate instead).
 */
export async function updateTransaction(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const input = updateTransactionSchema.parse({
    id: formData.get('id'),
    accountId: formData.get('accountId'),
    categoryId: formData.get('categoryId') || undefined,
    type: formData.get('type'),
    amountCents: parseInt(formData.get('amountCents') as string, 10),
    description: formData.get('description'),
    date: formData.get('date'),
  })

  // Fetch old transaction to reverse its balance impact
  const [oldTx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, input.id), eq(transactions.orgId, orgId)))
    .limit(1)

  if (!oldTx) throw new Error('Transaction not found')
  if (oldTx.transferGroupId) throw new Error('Cannot edit transfer transactions. Delete and recreate instead.')

  const newSignedAmount = input.type === 'income' ? input.amountCents : -input.amountCents

  await db.transaction(async (tx) => {
    await assertAccountOwnership(tx as unknown as Db, input.accountId, orgId)

    // Reverse old balance impact
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${-oldTx.amountCents}` })
      .where(eq(accounts.id, oldTx.accountId))

    // If account changed, apply new impact to new account
    if (input.accountId !== oldTx.accountId) {
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${newSignedAmount}` })
        .where(eq(accounts.id, input.accountId))
    } else {
      // Same account: apply new impact
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${newSignedAmount}` })
        .where(eq(accounts.id, input.accountId))
    }

    // Update the transaction row
    await tx
      .update(transactions)
      .set({
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        type: input.type,
        amountCents: newSignedAmount,
        description: input.description,
        date: new Date(input.date),
      })
      .where(and(eq(transactions.id, input.id), eq(transactions.orgId, orgId)))
  })

  revalidatePath('/transactions')
  revalidatePath('/accounts')
  revalidatePath('/dashboard')
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/finance/actions.ts packages/shared/src/schemas/finance.ts
git commit -m "feat: add deleteTransaction and updateTransaction server actions"
```

### Task 3.2: Add edit/delete UI to TransactionList

**Files:**
- Modify: `apps/web/components/finance/transaction-list.tsx`
- Modify: `apps/web/app/(app)/transactions/page.tsx`

- [ ] **Step 1: Rewrite TransactionList as client component with actions**

Rewrite `apps/web/components/finance/transaction-list.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { formatBRL } from '@floow/core-finance'
import { deleteTransaction, updateTransaction } from '@/lib/finance/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TransactionRow {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amountCents: number
  description: string
  date: Date | string
  accountId: string
  categoryId?: string | null
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
  transferGroupId?: string | null
}

interface AccountOption {
  id: string
  name: string
}

interface CategoryOption {
  id: string
  name: string
  type: string
}

interface TransactionListProps {
  transactions: TransactionRow[]
  accounts: AccountOption[]
  categories: CategoryOption[]
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function toDateInputValue(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0]
}

const TYPE_STYLES = {
  income: 'text-green-700',
  expense: 'text-red-600',
  transfer: 'text-blue-600',
} as const

const TYPE_LABELS = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
} as const

export function TransactionList({ transactions, accounts, categories }: TransactionListProps) {
  const { toast } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TransactionRow | null>(null)
  const [loading, setLoading] = useState(false)

  // Edit form state
  const [editDesc, setEditDesc] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editType, setEditType] = useState<'income' | 'expense'>('expense')
  const [editAccountId, setEditAccountId] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')

  function startEdit(tx: TransactionRow) {
    setEditingId(tx.id)
    setEditDesc(tx.description)
    setEditAmount(String(Math.abs(tx.amountCents)))
    setEditDate(toDateInputValue(tx.date))
    setEditType(tx.type === 'income' ? 'income' : 'expense')
    setEditAccountId(tx.accountId)
    setEditCategoryId(tx.categoryId ?? '')
  }

  async function handleUpdate(txId: string) {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', txId)
      formData.append('accountId', editAccountId)
      if (editCategoryId) formData.append('categoryId', editCategoryId)
      formData.append('type', editType)
      formData.append('amountCents', editAmount)
      formData.append('description', editDesc)
      formData.append('date', editDate)
      await updateTransaction(formData)
      setEditingId(null)
      toast('Transação atualizada com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar transação', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', deleteTarget.id)
      await deleteTransaction(formData)
      setDeleteTarget(null)
      toast('Transação removida com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao remover transação', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
        <p className="text-gray-500">Nenhuma transação encontrada.</p>
        <p className="mt-1 text-sm text-gray-400">Registre sua primeira transação para começar.</p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Data</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Descrição</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Categoria</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tipo</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Valor</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map((tx) => (
              editingId === tx.id && !tx.transferGroupId ? (
                <tr key={tx.id} className="bg-blue-50">
                  <td className="px-4 py-2">
                    <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-8 text-xs" />
                  </td>
                  <td className="px-4 py-2">
                    <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-8 text-xs" />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={editCategoryId}
                      onChange={(e) => setEditCategoryId(e.target.value)}
                      className="h-8 w-full rounded border border-gray-300 text-xs"
                    >
                      <option value="">Sem categoria</option>
                      {categories.filter((c) => c.type === editType).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as 'income' | 'expense')}
                      className="h-8 rounded border border-gray-300 text-xs"
                    >
                      <option value="income">Receita</option>
                      <option value="expense">Despesa</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <Input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-8 text-xs text-right" />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" onClick={() => handleUpdate(tx.id)} disabled={loading} className="h-7 text-xs">
                        {loading ? '...' : 'Salvar'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="h-7 text-xs">
                        Cancelar
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{formatDate(tx.date)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{tx.description}</td>
                  <td className="px-4 py-3">
                    {tx.categoryName ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: tx.categoryColor ? `${tx.categoryColor}20` : '#e5e7eb',
                          color: tx.categoryColor ?? '#6b7280',
                        }}
                      >
                        {tx.categoryIcon && <span>{tx.categoryIcon}</span>}
                        {tx.categoryName}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{TYPE_LABELS[tx.type]}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${TYPE_STYLES[tx.type]}`}>
                    {tx.amountCents >= 0 ? '+' : ''}{formatBRL(tx.amountCents)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {!tx.transferGroupId && (
                        <button
                          type="button"
                          onClick={() => startEdit(tx)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(tx)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remover transação"
        description={
          deleteTarget?.transferGroupId
            ? `Tem certeza que deseja remover esta transferência? Ambas as pernas serão removidas e os saldos revertidos.`
            : `Tem certeza que deseja remover "${deleteTarget?.description ?? ''}"? O saldo da conta será revertido.`
        }
        confirmLabel="Remover"
        loading={loading}
      />
    </>
  )
}
```

- [ ] **Step 2: Update TransactionsPage to pass accounts and categories**

Modify `apps/web/app/(app)/transactions/page.tsx`:

```tsx
import Link from 'next/link'
import { getOrgId, getTransactions, getAccounts, getCategories } from '@/lib/finance/queries'
import { TransactionList } from '@/components/finance/transaction-list'
import { Button } from '@/components/ui/button'

export default async function TransactionsPage() {
  const orgId = await getOrgId()
  const [transactions, accounts, categories] = await Promise.all([
    getTransactions(orgId, { limit: 50 }),
    getAccounts(orgId),
    getCategories(orgId),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Transações</h1>
          <p className="mt-1 text-sm text-gray-500">
            {transactions.length > 0
              ? `${transactions.length} transação(ões) encontrada(s)`
              : 'Nenhuma transação registrada'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <Link href="/transactions/import">Importar</Link>
          </Button>
          <Button asChild>
            <Link href="/transactions/new">Nova Transação</Link>
          </Button>
        </div>
      </div>

      <TransactionList
        transactions={transactions}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
      />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/finance/transaction-list.tsx apps/web/app/\(app\)/transactions/page.tsx
git commit -m "feat: add inline edit and delete to TransactionList with toast feedback"
```

---

## Chunk 4: Transaction Filtering & Pagination

### Task 4.1: Add filter bar and pagination to transactions page

**Files:**
- Create: `apps/web/components/finance/transaction-filters.tsx`
- Create: `apps/web/components/ui/pagination.tsx`
- Modify: `apps/web/app/(app)/transactions/page.tsx`
- Modify: `apps/web/lib/finance/queries.ts`

- [ ] **Step 1: Add count query to queries.ts**

Add to `apps/web/lib/finance/queries.ts` (import `count` from `drizzle-orm`):

```ts
import { eq, and, desc, isNull, or, gte, count, ilike } from 'drizzle-orm'

export async function getTransactionCount(
  orgId: string,
  opts?: { accountId?: string; search?: string; startDate?: string; endDate?: string }
) {
  const db = getDb()

  const conditions = [eq(transactions.orgId, orgId)]

  if (opts?.accountId) conditions.push(eq(transactions.accountId, opts.accountId))
  if (opts?.search) conditions.push(ilike(transactions.description, `%${opts.search}%`))
  if (opts?.startDate) conditions.push(gte(transactions.date, new Date(opts.startDate)))
  if (opts?.endDate) {
    const { lte } = await import('drizzle-orm')
    conditions.push(lte(transactions.date, new Date(opts.endDate)))
  }

  const [result] = await db
    .select({ total: count() })
    .from(transactions)
    .where(and(...conditions))

  return result.total
}
```

- [ ] **Step 2: Update getTransactions to support search and date filters**

Update the existing `getTransactions` function in `apps/web/lib/finance/queries.ts`:

```ts
export async function getTransactions(
  orgId: string,
  opts?: { limit?: number; offset?: number; accountId?: string; search?: string; startDate?: string; endDate?: string }
) {
  const db = getDb()
  const limit = opts?.limit ?? 50
  const offset = opts?.offset ?? 0

  const conditions = [eq(transactions.orgId, orgId)]

  if (opts?.accountId) conditions.push(eq(transactions.accountId, opts.accountId))
  if (opts?.search) conditions.push(ilike(transactions.description, `%${opts.search}%`))
  if (opts?.startDate) conditions.push(gte(transactions.date, new Date(opts.startDate)))
  if (opts?.endDate) {
    const { lte } = await import('drizzle-orm')
    conditions.push(lte(transactions.date, new Date(opts.endDate)))
  }

  return db
    .select({
      id: transactions.id,
      orgId: transactions.orgId,
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
      type: transactions.type,
      amountCents: transactions.amountCents,
      description: transactions.description,
      date: transactions.date,
      transferGroupId: transactions.transferGroupId,
      importedAt: transactions.importedAt,
      externalId: transactions.externalId,
      createdAt: transactions.createdAt,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.date))
    .limit(limit)
    .offset(offset)
}
```

- [ ] **Step 3: Create Pagination component**

Create `apps/web/components/ui/pagination.tsx`:

```tsx
import Link from 'next/link'
import { Button } from './button'

interface PaginationProps {
  currentPage: number
  totalPages: number
  baseUrl: string
  searchParams: Record<string, string>
}

export function Pagination({ currentPage, totalPages, baseUrl, searchParams }: PaginationProps) {
  if (totalPages <= 1) return null

  function buildUrl(page: number) {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(page))
    return `${baseUrl}?${params.toString()}`
  }

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-gray-500">
        Página {currentPage} de {totalPages}
      </p>
      <div className="flex gap-2">
        {currentPage > 1 && (
          <Button asChild variant="outline" size="sm">
            <Link href={buildUrl(currentPage - 1)}>Anterior</Link>
          </Button>
        )}
        {currentPage < totalPages && (
          <Button asChild variant="outline" size="sm">
            <Link href={buildUrl(currentPage + 1)}>Próxima</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create TransactionFilters component**

Create `apps/web/components/finance/transaction-filters.tsx`:

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface AccountOption {
  id: string
  name: string
}

interface TransactionFiltersProps {
  accounts: AccountOption[]
}

export function TransactionFilters({ accounts }: TransactionFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [accountId, setAccountId] = useState(searchParams.get('accountId') ?? '')
  const [startDate, setStartDate] = useState(searchParams.get('startDate') ?? '')
  const [endDate, setEndDate] = useState(searchParams.get('endDate') ?? '')

  function applyFilters() {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (accountId) params.set('accountId', accountId)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    params.set('page', '1')
    router.push(`/transactions?${params.toString()}`)
  }

  function clearFilters() {
    setSearch('')
    setAccountId('')
    setStartDate('')
    setEndDate('')
    router.push('/transactions')
  }

  const hasFilters = search || accountId || startDate || endDate

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="min-w-[160px]">
        <label className="block text-xs font-medium text-gray-500 mb-1">Conta</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
        >
          <option value="">Todas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="min-w-[140px]">
        <label className="block text-xs font-medium text-gray-500 mb-1">Data início</label>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
      </div>

      <div className="min-w-[140px]">
        <label className="block text-xs font-medium text-gray-500 mb-1">Data fim</label>
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={applyFilters} className="h-9">
          Filtrar
        </Button>
        {hasFilters && (
          <Button size="sm" variant="outline" onClick={clearFilters} className="h-9">
            Limpar
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Update TransactionsPage with filters and pagination**

Rewrite `apps/web/app/(app)/transactions/page.tsx`:

```tsx
import Link from 'next/link'
import { getOrgId, getTransactions, getTransactionCount, getAccounts, getCategories } from '@/lib/finance/queries'
import { TransactionList } from '@/components/finance/transaction-list'
import { TransactionFilters } from '@/components/finance/transaction-filters'
import { Pagination } from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'

const PAGE_SIZE = 30

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function TransactionsPage({ searchParams }: Props) {
  const params = await searchParams
  const orgId = await getOrgId()

  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const filters = {
    accountId: params.accountId,
    search: params.search,
    startDate: params.startDate,
    endDate: params.endDate,
  }

  const [transactions, totalCount, accounts, categories] = await Promise.all([
    getTransactions(orgId, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...filters }),
    getTransactionCount(orgId, filters),
    getAccounts(orgId),
    getCategories(orgId),
  ])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // Build searchParams for pagination links (exclude page)
  const paginationParams: Record<string, string> = {}
  if (filters.accountId) paginationParams.accountId = filters.accountId
  if (filters.search) paginationParams.search = filters.search
  if (filters.startDate) paginationParams.startDate = filters.startDate
  if (filters.endDate) paginationParams.endDate = filters.endDate

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Transações</h1>
          <p className="mt-1 text-sm text-gray-500">
            {totalCount > 0
              ? `${totalCount} transação(ões) encontrada(s)`
              : 'Nenhuma transação registrada'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <Link href="/transactions/import">Importar</Link>
          </Button>
          <Button asChild>
            <Link href="/transactions/new">Nova Transação</Link>
          </Button>
        </div>
      </div>

      <TransactionFilters accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />

      <TransactionList
        transactions={transactions}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
      />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        baseUrl="/transactions"
        searchParams={paginationParams}
      />
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/finance/queries.ts apps/web/components/finance/transaction-filters.tsx apps/web/components/ui/pagination.tsx apps/web/app/\(app\)/transactions/page.tsx
git commit -m "feat: add transaction filtering (account, search, date) and pagination"
```

---

## Chunk 5: Account Drill-Down

### Task 5.1: Make AccountCard link to filtered transactions

**Files:**
- Modify: `apps/web/components/finance/account-card.tsx`

- [ ] **Step 1: Add "Ver transações" link to AccountCard**

In `apps/web/components/finance/account-card.tsx`, add a Link at the bottom of the card content:

```tsx
// Add import at top:
import Link from 'next/link'

// Add after the currency line in the non-editing card:
<Link
  href={`/transactions?accountId=${account.id}`}
  className="mt-2 inline-block text-xs text-blue-600 hover:text-blue-800 hover:underline"
>
  Ver transações →
</Link>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/finance/account-card.tsx
git commit -m "feat: add account drill-down link to transactions"
```

---

## Chunk 6: Investment CRUD (Delete/Edit Asset & Portfolio Event)

### Task 6.1: Add investment server actions

**Files:**
- Modify: `apps/web/lib/investments/actions.ts`
- Modify: `packages/shared/src/schemas/investments.ts`

- [ ] **Step 1: Add update schemas to shared investments schemas**

Append to `packages/shared/src/schemas/investments.ts`:

```ts
export const updateAssetSchema = z.object({
  id: z.string().uuid(),
  ticker: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  assetClass: z.enum(['br_equity', 'fii', 'etf', 'crypto', 'fixed_income', 'international']),
  currency: z.string().default('BRL'),
  notes: z.string().optional(),
})

export type UpdateAssetInput = z.infer<typeof updateAssetSchema>
```

- [ ] **Step 2: Add deleteAsset server action**

Add to `apps/web/lib/investments/actions.ts`:

```ts
/**
 * Server action: delete an asset and all its portfolio events, prices.
 * DB cascade handles deleting portfolio_events and asset_prices (ON DELETE CASCADE).
 * Also reverses balance impacts from any cash-flow portfolio events.
 */
export async function deleteAsset(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const assetId = formData.get('id') as string
  if (!assetId) throw new Error('Asset ID is required')

  await assertAssetOwnership(db, assetId, orgId)

  await db.transaction(async (tx) => {
    // Find all portfolio events that generated cash-flow transactions
    const events = await tx
      .select({ transactionId: portfolioEvents.transactionId })
      .from(portfolioEvents)
      .where(and(eq(portfolioEvents.assetId, assetId), eq(portfolioEvents.orgId, orgId)))

    // Reverse balance impacts for linked transactions
    for (const evt of events) {
      if (!evt.transactionId) continue
      const [linkedTx] = await tx
        .select({ accountId: transactions.accountId, amountCents: transactions.amountCents })
        .from(transactions)
        .where(eq(transactions.id, evt.transactionId))
        .limit(1)

      if (linkedTx) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${-linkedTx.amountCents}` })
          .where(eq(accounts.id, linkedTx.accountId))

        await tx
          .delete(transactions)
          .where(eq(transactions.id, evt.transactionId))
      }
    }

    // Delete asset (cascades to portfolio_events and asset_prices)
    await tx
      .delete(assets)
      .where(and(eq(assets.id, assetId), eq(assets.orgId, orgId)))
  })

  revalidatePath('/investments')
  revalidatePath('/investments/dashboard')
  revalidatePath('/investments/income')
  revalidatePath('/dashboard')
  revalidatePath('/transactions')
  revalidatePath('/accounts')
}
```

- [ ] **Step 3: Add updateAsset server action**

Add to `apps/web/lib/investments/actions.ts` (import `updateAssetSchema` from `@floow/shared`):

```ts
export async function updateAsset(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const input = updateAssetSchema.parse({
    id: formData.get('id'),
    ticker: formData.get('ticker'),
    name: formData.get('name'),
    assetClass: formData.get('assetClass'),
    currency: formData.get('currency') || 'BRL',
    notes: formData.get('notes') || undefined,
  })

  await assertAssetOwnership(db, input.id, orgId)

  const [updated] = await db
    .update(assets)
    .set({
      ticker: input.ticker.toUpperCase(),
      name: input.name,
      assetClass: input.assetClass,
      currency: input.currency,
      notes: input.notes ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(assets.id, input.id), eq(assets.orgId, orgId)))
    .returning()

  revalidatePath('/investments')
  revalidatePath('/investments/dashboard')

  return updated
}
```

- [ ] **Step 4: Add deletePortfolioEvent server action**

Add to `apps/web/lib/investments/actions.ts`:

```ts
/**
 * Server action: delete a portfolio event and reverse its cash-flow impact.
 * If the event has a linked transaction, reverses the balance and deletes the transaction.
 */
export async function deletePortfolioEvent(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const eventId = formData.get('id') as string
  if (!eventId) throw new Error('Event ID is required')

  const [event] = await db
    .select()
    .from(portfolioEvents)
    .where(and(eq(portfolioEvents.id, eventId), eq(portfolioEvents.orgId, orgId)))
    .limit(1)

  if (!event) throw new Error('Portfolio event not found')

  await db.transaction(async (tx) => {
    // Reverse cash-flow transaction if it exists
    if (event.transactionId) {
      const [linkedTx] = await tx
        .select({ accountId: transactions.accountId, amountCents: transactions.amountCents })
        .from(transactions)
        .where(eq(transactions.id, event.transactionId))
        .limit(1)

      if (linkedTx) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${-linkedTx.amountCents}` })
          .where(eq(accounts.id, linkedTx.accountId))

        await tx
          .delete(transactions)
          .where(eq(transactions.id, event.transactionId))
      }
    }

    // Delete the portfolio event
    await tx
      .delete(portfolioEvents)
      .where(and(eq(portfolioEvents.id, eventId), eq(portfolioEvents.orgId, orgId)))
  })

  revalidatePath('/investments')
  revalidatePath('/investments/dashboard')
  revalidatePath('/investments/income')
  revalidatePath('/dashboard')
  revalidatePath('/transactions')
  revalidatePath('/accounts')
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/investments/actions.ts packages/shared/src/schemas/investments.ts
git commit -m "feat: add CRUD server actions for assets and portfolio events"
```

### Task 6.2: Add edit/delete UI to PositionTable

**Files:**
- Modify: `apps/web/components/investments/position-table.tsx`

- [ ] **Step 1: Add delete button to PositionRow**

In `apps/web/components/investments/position-table.tsx`, modify the PositionRow component's actions cell to add edit and delete buttons:

```tsx
// Add imports at top:
import { Pencil, Trash2 } from 'lucide-react'
import { deleteAsset } from '@/lib/investments/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'

// Inside PositionRow, add state:
const { toast } = useToast()
const [confirmDelete, setConfirmDelete] = useState(false)
const [deleting, setDeleting] = useState(false)

async function handleDeleteAsset() {
  setDeleting(true)
  try {
    const formData = new FormData()
    formData.append('id', position.assetId)
    await deleteAsset(formData)
    setConfirmDelete(false)
    toast('Ativo removido com sucesso')
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Erro ao remover ativo', 'error')
  } finally {
    setDeleting(false)
  }
}

// In the actions td, add:
<button
  type="button"
  onClick={() => setConfirmDelete(true)}
  className="text-xs text-red-500 hover:text-red-700 underline"
>
  Excluir
</button>

// After the closing </> of PositionRow return, add ConfirmDialog:
<ConfirmDialog
  open={confirmDelete}
  onClose={() => setConfirmDelete(false)}
  onConfirm={handleDeleteAsset}
  title="Remover ativo"
  description={`Tem certeza que deseja remover "${position.ticker}"? Todos os eventos e preços serão removidos. Transações vinculadas terão seus saldos revertidos.`}
  confirmLabel="Remover"
  loading={deleting}
/>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/investments/position-table.tsx
git commit -m "feat: add delete button to investment position table"
```

### Task 6.3: Create asset edit page

**Files:**
- Create: `apps/web/app/(app)/investments/[assetId]/edit/page.tsx`

- [ ] **Step 1: Create edit asset page**

Create `apps/web/app/(app)/investments/[assetId]/edit/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getOrgId } from '@/lib/finance/queries'
import { getAssets } from '@/lib/investments/queries'
import { AssetEditForm } from '@/components/investments/asset-edit-form'

interface Props {
  params: Promise<{ assetId: string }>
}

export default async function EditAssetPage({ params }: Props) {
  const { assetId } = await params
  const orgId = await getOrgId()
  const assets = await getAssets(orgId)
  const asset = assets.find((a) => a.id === assetId)

  if (!asset) redirect('/investments')

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Editar Ativo</h1>
      <AssetEditForm asset={asset} />
    </div>
  )
}
```

- [ ] **Step 2: Create AssetEditForm component**

Create `apps/web/components/investments/asset-edit-form.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { updateAssetSchema, type UpdateAssetInput } from '@floow/shared'
import { updateAsset } from '@/lib/investments/actions'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Asset } from '@floow/db'

const ASSET_CLASSES = [
  { value: 'br_equity', label: 'Ações BR' },
  { value: 'fii', label: 'FIIs' },
  { value: 'etf', label: 'ETFs' },
  { value: 'crypto', label: 'Cripto' },
  { value: 'fixed_income', label: 'Renda Fixa' },
  { value: 'international', label: 'Internacional' },
] as const

interface AssetEditFormProps {
  asset: Asset
}

export function AssetEditForm({ asset }: AssetEditFormProps) {
  const router = useRouter()
  const { toast } = useToast()

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<UpdateAssetInput>({
    resolver: zodResolver(updateAssetSchema),
    defaultValues: {
      id: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      assetClass: asset.assetClass,
      currency: asset.currency,
      notes: asset.notes ?? '',
    },
  })

  async function onSubmit(data: UpdateAssetInput) {
    try {
      const formData = new FormData()
      formData.append('id', data.id)
      formData.append('ticker', data.ticker)
      formData.append('name', data.name)
      formData.append('assetClass', data.assetClass)
      formData.append('currency', data.currency)
      if (data.notes) formData.append('notes', data.notes)
      await updateAsset(formData)
      toast('Ativo atualizado com sucesso')
      router.push('/investments')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar ativo', 'error')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <input type="hidden" {...register('id')} />

      <div>
        <Label>Ticker</Label>
        <Input {...register('ticker')} />
        {errors.ticker && <p className="text-xs text-red-600 mt-1">{errors.ticker.message}</p>}
      </div>

      <div>
        <Label>Nome</Label>
        <Input {...register('name')} />
        {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <Label>Classe</Label>
        <select
          {...register('assetClass')}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          {ASSET_CLASSES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        {errors.assetClass && <p className="text-xs text-red-600 mt-1">{errors.assetClass.message}</p>}
      </div>

      <div>
        <Label>Moeda</Label>
        <Input {...register('currency')} />
      </div>

      <div>
        <Label>Observações</Label>
        <Input {...register('notes')} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/investments')}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Add edit link in PositionRow**

In `apps/web/components/investments/position-table.tsx`, add an edit link in the actions cell:

```tsx
// Add import:
import Link from 'next/link'

// In the actions div, add before the delete button:
<Link
  href={`/investments/${position.assetId}/edit`}
  className="text-xs text-gray-500 hover:text-gray-800 underline"
>
  Editar
</Link>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/investments/\[assetId\]/edit/page.tsx apps/web/components/investments/asset-edit-form.tsx apps/web/components/investments/position-table.tsx
git commit -m "feat: add asset edit page and link from position table"
```

---

## Chunk 7: Category Management

### Task 7.1: Add category server actions

**Files:**
- Modify: `apps/web/lib/finance/actions.ts`
- Modify: `packages/shared/src/schemas/finance.ts`

- [ ] **Step 1: Add category schemas to shared**

Append to `packages/shared/src/schemas/finance.ts`:

```ts
export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['income', 'expense']),
  color: z.string().optional(),
  icon: z.string().optional(),
})

export const updateCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.enum(['income', 'expense']),
  color: z.string().optional(),
  icon: z.string().optional(),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
```

- [ ] **Step 2: Add category server actions**

Add to `apps/web/lib/finance/actions.ts` (import `categories` from `@floow/db`, import schemas from `@floow/shared`):

```ts
export async function createCategory(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const input = createCategorySchema.parse({
    name: formData.get('name'),
    type: formData.get('type'),
    color: formData.get('color') || undefined,
    icon: formData.get('icon') || undefined,
  })

  const [category] = await db
    .insert(categories)
    .values({ orgId, ...input })
    .returning()

  revalidatePath('/categories')
  revalidatePath('/transactions')

  return category
}

export async function updateCategory(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const input = updateCategorySchema.parse({
    id: formData.get('id'),
    name: formData.get('name'),
    type: formData.get('type'),
    color: formData.get('color') || undefined,
    icon: formData.get('icon') || undefined,
  })

  const [updated] = await db
    .update(categories)
    .set({ name: input.name, type: input.type, color: input.color ?? null, icon: input.icon ?? null })
    .where(and(eq(categories.id, input.id), eq(categories.orgId, orgId)))
    .returning()

  if (!updated) throw new Error('Category not found or is a system category')

  revalidatePath('/categories')
  revalidatePath('/transactions')

  return updated
}

export async function deleteCategory(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const categoryId = formData.get('id') as string
  if (!categoryId) throw new Error('Category ID is required')

  // Prevent deleting system categories
  const [cat] = await db
    .select({ isSystem: categories.isSystem })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.orgId, orgId)))
    .limit(1)

  if (!cat) throw new Error('Category not found')
  if (cat.isSystem) throw new Error('Cannot delete system categories')

  // Delete category — transactions will have categoryId set to NULL (ON DELETE SET NULL)
  await db
    .delete(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.orgId, orgId)))

  revalidatePath('/categories')
  revalidatePath('/transactions')
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/finance/actions.ts packages/shared/src/schemas/finance.ts
git commit -m "feat: add category CRUD server actions"
```

### Task 7.2: Create categories page

**Files:**
- Create: `apps/web/app/(app)/categories/page.tsx`
- Create: `apps/web/components/finance/category-list.tsx`
- Modify: `apps/web/components/layout/sidebar.tsx` (add link)

- [ ] **Step 1: Create CategoryList component**

Create `apps/web/components/finance/category-list.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { createCategory, updateCategory, deleteCategory } from '@/lib/finance/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Category {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer'
  color: string | null
  icon: string | null
  isSystem: boolean
  orgId: string | null
}

interface CategoryListProps {
  categories: Category[]
}

export function CategoryList({ categories }: CategoryListProps) {
  const { toast } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [color, setColor] = useState('#6b7280')
  const [icon, setIcon] = useState('')

  function startEdit(cat: Category) {
    setEditingId(cat.id)
    setName(cat.name)
    setType(cat.type as 'income' | 'expense')
    setColor(cat.color ?? '#6b7280')
    setIcon(cat.icon ?? '')
  }

  function resetForm() {
    setName('')
    setType('expense')
    setColor('#6b7280')
    setIcon('')
  }

  async function handleCreate() {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('name', name)
      formData.append('type', type)
      if (color) formData.append('color', color)
      if (icon) formData.append('icon', icon)
      await createCategory(formData)
      setShowCreate(false)
      resetForm()
      toast('Categoria criada com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar categoria', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdate(catId: string) {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', catId)
      formData.append('name', name)
      formData.append('type', type)
      if (color) formData.append('color', color)
      if (icon) formData.append('icon', icon)
      await updateCategory(formData)
      setEditingId(null)
      resetForm()
      toast('Categoria atualizada com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar categoria', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', deleteTarget.id)
      await deleteCategory(formData)
      setDeleteTarget(null)
      toast('Categoria removida com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao remover categoria', 'error')
    } finally {
      setLoading(false)
    }
  }

  const incomeCategories = categories.filter((c) => c.type === 'income')
  const expenseCategories = categories.filter((c) => c.type === 'expense')

  function renderCategoryGroup(title: string, cats: Category[]) {
    return (
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
        <div className="space-y-1">
          {cats.map((cat) => (
            editingId === cat.id ? (
              <div key={cat.id} className="flex items-center gap-2 rounded-lg bg-blue-50 p-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-8 rounded border" />
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm flex-1" />
                <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="Emoji" className="h-8 w-16 text-sm" />
                <Button size="sm" onClick={() => handleUpdate(cat.id)} disabled={loading} className="h-8">Salvar</Button>
                <Button size="sm" variant="outline" onClick={() => { setEditingId(null); resetForm() }} className="h-8">Cancelar</Button>
              </div>
            ) : (
              <div key={cat.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: cat.color ? `${cat.color}20` : '#e5e7eb',
                      color: cat.color ?? '#6b7280',
                    }}
                  >
                    {cat.icon && <span>{cat.icon}</span>}
                    {cat.name}
                  </span>
                  {cat.isSystem && <span className="text-[10px] text-gray-400">sistema</span>}
                </div>
                {!cat.isSystem && cat.orgId && (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => startEdit(cat)} className="rounded p-1 text-gray-400 hover:text-gray-700">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(cat)} className="rounded p-1 text-gray-400 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {/* Create form */}
        {showCreate ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Nova Categoria</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cor</label>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 rounded border" />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs text-gray-500 mb-1">Nome</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                <select value={type} onChange={(e) => setType(e.target.value as 'income' | 'expense')} className="h-9 rounded-md border border-gray-300 px-3 text-sm">
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                </select>
              </div>
              <div className="w-16">
                <label className="block text-xs text-gray-500 mb-1">Ícone</label>
                <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏷️" className="h-9" />
              </div>
              <Button size="sm" onClick={handleCreate} disabled={loading || !name} className="h-9">Criar</Button>
              <Button size="sm" variant="outline" onClick={() => { setShowCreate(false); resetForm() }} className="h-9">Cancelar</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova Categoria
          </Button>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-6">
          {renderCategoryGroup('Despesas', expenseCategories)}
          {renderCategoryGroup('Receitas', incomeCategories)}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remover categoria"
        description={`Tem certeza que deseja remover "${deleteTarget?.name ?? ''}"? Transações com esta categoria ficarão sem categoria.`}
        confirmLabel="Remover"
        loading={loading}
      />
    </>
  )
}
```

- [ ] **Step 2: Create categories page**

Create `apps/web/app/(app)/categories/page.tsx`:

```tsx
import { getOrgId, getCategories } from '@/lib/finance/queries'
import { CategoryList } from '@/components/finance/category-list'

export default async function CategoriesPage() {
  const orgId = await getOrgId()
  const categories = await getCategories(orgId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Categorias</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gerencie as categorias de receitas e despesas
        </p>
      </div>

      <CategoryList categories={categories} />
    </div>
  )
}
```

- [ ] **Step 3: Add categories link to sidebar**

In `apps/web/components/layout/sidebar.tsx`, add a nav item for `/categories` with a `Tags` icon from lucide-react:

```tsx
{ href: '/categories', label: 'Categorias', icon: Tags }
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/finance/category-list.tsx apps/web/app/\(app\)/categories/page.tsx apps/web/components/layout/sidebar.tsx
git commit -m "feat: add category management page with CRUD"
```

---

## Chunk 8: Responsive Sidebar & Error Boundary

### Task 8.1: Make sidebar collapsible on mobile

**Files:**
- Modify: `apps/web/components/layout/sidebar.tsx`

- [ ] **Step 1: Add mobile toggle to sidebar**

Wrap sidebar in a responsive layout:
- On desktop (`lg:`) show sidebar always
- On mobile, toggle via hamburger button
- Add a state variable `open` and toggle button
- Use a semi-transparent backdrop when open on mobile

```tsx
// Add to sidebar component:
const [open, setOpen] = useState(false)

// Hamburger button (only visible on mobile):
<button
  type="button"
  onClick={() => setOpen(true)}
  className="fixed top-4 left-4 z-40 rounded-lg bg-white p-2 shadow-md lg:hidden"
>
  <Menu className="h-5 w-5" />
</button>

// Sidebar wrapper:
<>
  {/* Backdrop */}
  {open && (
    <div
      className="fixed inset-0 z-40 bg-black/30 lg:hidden"
      onClick={() => setOpen(false)}
    />
  )}

  <aside className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-white border-r transition-transform lg:translate-x-0 ${
    open ? 'translate-x-0' : '-translate-x-full'
  }`}>
    {/* existing sidebar content */}
  </aside>
</>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/layout/sidebar.tsx
git commit -m "feat: make sidebar collapsible on mobile"
```

### Task 8.2: Add error boundary

**Files:**
- Create: `apps/web/app/(app)/error.tsx`

- [ ] **Step 1: Create error boundary page**

Create `apps/web/app/(app)/error.tsx`:

```tsx
'use client'

import { Button } from '@/components/ui/button'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h2 className="text-xl font-semibold text-gray-900">Algo deu errado</h2>
      <p className="mt-2 text-sm text-gray-500 max-w-md">
        {error.message || 'Ocorreu um erro inesperado. Tente novamente.'}
      </p>
      <Button onClick={reset} className="mt-6">
        Tentar novamente
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(app\)/error.tsx
git commit -m "feat: add error boundary with retry for app pages"
```

---

## Summary of All Deliverables

| # | Backlog Item | Status | Chunk |
|---|-------------|--------|-------|
| 1 | Delete transaction | Chunk 3 |
| 2 | Edit transaction | Chunk 3 |
| 3 | Delete account | Chunk 2 |
| 4 | Edit account | Chunk 2 |
| 5 | Filter by account | Chunk 4 |
| 6 | Pagination | Chunk 4 |
| 7 | Toast feedback | Chunk 1 |
| 8 | Search/filter (date, description) | Chunk 4 |
| 9 | Account drill-down | Chunk 5 |
| 10 | Delete/edit asset | Chunk 6 |
| 11 | Delete/edit portfolio event | Chunk 6 |
| 12 | Custom categories | Chunk 7 |
| 13 | Delete confirmation modal | Chunks 2, 3, 6, 7 (built into each) |
| 14 | Global toast | Chunk 1 |
| 15 | Responsive sidebar | Chunk 8 |
| 16 | Error boundary | Chunk 8 |
