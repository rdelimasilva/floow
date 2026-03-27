'use client'

import { createContext, useContext, useState } from 'react'
import { TransactionForm } from './transaction-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Account, Category } from '@floow/db'

export interface InlineCreatedTransaction {
  id: string
  accountId: string
  categoryId?: string | null
  type: 'income' | 'expense' | 'transfer'
  amountCents: number
  description: string
  date: string | Date
  transferGroupId?: string | null
  externalId?: string | null
  isAutoCategorized?: boolean
  isIgnored?: boolean
  recurringTemplateId?: string | null
  balanceApplied?: boolean
  installmentNumber?: number | null
  installmentTotal?: number | null
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
}

export const InlineFormContext = createContext<{
  open: boolean
  toggle: () => void
  close: () => void
  createdTransactions: InlineCreatedTransaction[]
  addCreatedTransactions: (transactions: InlineCreatedTransaction[]) => void
} | null>(null)

interface InlineTransactionFormProviderProps {
  children: React.ReactNode
}

export function InlineTransactionFormProvider({ children }: InlineTransactionFormProviderProps) {
  const [open, setOpen] = useState(false)
  const [createdTransactions, setCreatedTransactions] = useState<InlineCreatedTransaction[]>([])

  return (
    <InlineFormContext.Provider
      value={{
        open,
        toggle: () => setOpen((v) => !v),
        close: () => setOpen(false),
        createdTransactions,
        addCreatedTransactions: (transactions) =>
          setCreatedTransactions((prev) => {
            const next = [...transactions, ...prev]
            const seen = new Set<string>()
            return next.filter((transaction) => {
              if (seen.has(transaction.id)) return false
              seen.add(transaction.id)
              return true
            })
          }),
      }}
    >
      {children}
    </InlineFormContext.Provider>
  )
}

export function InlineTransactionFormButton() {
  const ctx = useContext(InlineFormContext)
  if (!ctx) return null
  return (
    <Button variant="primary" onClick={ctx.toggle}>
      Nova Transação
    </Button>
  )
}

interface InlineTransactionFormPanelProps {
  accounts: Pick<Account, 'id' | 'name'>[]
  categories: Pick<Category, 'id' | 'name' | 'type'>[]
}

export function InlineTransactionFormPanel({ accounts, categories }: InlineTransactionFormPanelProps) {
  const ctx = useContext(InlineFormContext)
  if (!ctx || !ctx.open) return null
  const { addCreatedTransactions, close } = ctx

  function handleSuccess(transactions?: Array<{
    id: string
    accountId: string
    categoryId?: string | null
    type: 'income' | 'expense' | 'transfer'
    amountCents: number
    description: string
    date: string | Date
    transferGroupId?: string | null
    externalId?: string | null
    isAutoCategorized?: boolean
    isIgnored?: boolean
    recurringTemplateId?: string | null
    balanceApplied?: boolean
    installmentNumber?: number | null
    installmentTotal?: number | null
  }>) {
    if (transactions && transactions.length > 0) {
      const categoryMap = new Map(categories.map((category) => [category.id, category]))
      addCreatedTransactions(
        transactions.map((transaction) => {
          const category = transaction.categoryId ? categoryMap.get(transaction.categoryId) : undefined
          return {
            ...transaction,
            categoryName: category?.name ?? null,
            categoryColor: null,
            categoryIcon: null,
          }
        })
      )
    }
    close()
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Nova Transação</h3>
          <button
            type="button"
            onClick={close}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancelar
          </button>
        </div>
        <TransactionForm accounts={accounts as Account[]} categories={categories as Category[]} onSuccess={handleSuccess} />
      </CardContent>
    </Card>
  )
}
