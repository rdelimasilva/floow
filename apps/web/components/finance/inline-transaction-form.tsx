'use client'

import { createContext, useContext, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TransactionForm } from './transaction-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Account, Category } from '@floow/db'

// Context to share open state between button and form panel
const InlineFormContext = createContext<{
  open: boolean
  toggle: () => void
  close: () => void
} | null>(null)

interface InlineTransactionFormProviderProps {
  children: React.ReactNode
}

export function InlineTransactionFormProvider({ children }: InlineTransactionFormProviderProps) {
  const [open, setOpen] = useState(false)
  return (
    <InlineFormContext.Provider value={{ open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) }}>
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
  const router = useRouter()
  if (!ctx || !ctx.open) return null

  function handleSuccess() {
    ctx!.close()
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Nova Transação</h3>
          <button
            type="button"
            onClick={ctx.close}
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
