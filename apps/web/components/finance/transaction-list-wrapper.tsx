'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useContext, useMemo, useTransition } from 'react'
import { TransactionList } from './transaction-list'
import { currencyToCents } from '@floow/core-finance'
import { InlineFormContext, type InlineCreatedTransaction } from './inline-transaction-form'
import { lembrarFiltros } from '@/lib/finance/filtros-lembrados'

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
  const inlineForm = useContext(InlineFormContext)
  const [, startTransition] = useTransition()

  const navigate = useCallback((overrides: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    // Sem `page`: o servidor reabre na página da data mais recente quando a
    // ordem é crescente (`paginaQueAbre`). Fixar 1 aqui jogava em 2019.
    params.delete('page')
    lembrarFiltros(params)
    startTransition(() => {
      router.replace(`/transactions?${params.toString()}`, { scroll: false })
    })
  }, [router, searchParams, startTransition])

  const activeTypes = (searchParams.get('types') ?? '').split(',').filter(Boolean)
  const activeCategoryIds = (searchParams.get('categoryIds') ?? '').split(',').filter(Boolean)
  const activeMinAmount = searchParams.get('minAmount') ?? ''
  const activeMaxAmount = searchParams.get('maxAmount') ?? ''

  const visibleTransactions = useMemo(() => {
    const createdTransactions = inlineForm?.createdTransactions ?? []
    if (createdTransactions.length === 0) return transactions

    const matchesFilters = (transaction: InlineCreatedTransaction) => {
      // Uma conta ou várias, separadas por vírgula — mesmo parâmetro.
      const accountIds = (searchParams.get('accountId') ?? '').split(',').filter(Boolean)
      const search = searchParams.get('search')?.toLowerCase()
      const startDate = searchParams.get('startDate')
      const endDate = searchParams.get('endDate')
      const minAmount = searchParams.get('minAmount')
      const maxAmount = searchParams.get('maxAmount')
      const dateKey = typeof transaction.date === 'string'
        ? transaction.date.split('T')[0]
        : transaction.date.toISOString().split('T')[0]
      const amountAbs = Math.abs(transaction.amountCents)

      if (accountIds.length > 0 && !accountIds.includes(transaction.accountId)) return false
      if (search && !transaction.description.toLowerCase().includes(search)) return false
      if (startDate && dateKey < startDate) return false
      if (endDate && dateKey > endDate) return false
      if (activeTypes.length > 0 && !activeTypes.includes(transaction.type)) return false
      if (activeCategoryIds.length > 0 && (!transaction.categoryId || !activeCategoryIds.includes(transaction.categoryId))) return false
      if (minAmount && amountAbs < Number(minAmount)) return false
      if (maxAmount && amountAbs > Number(maxAmount)) return false

      return true
    }

    // Mesma ordem do servidor, e nada de exilar previsão para o fim: aqui
    // havia um desempate por `balanceApplied` que o SQL já tinha abandonado
    // (ver `buildTransactionOrder`), então criar um lançamento pela linha
    // rápida reembaralhava a lista que acabara de ser carregada.
    const compare = (a: Props['transactions'][number], b: Props['transactions'][number]) => {
      const direction = sortDir === 'asc' ? 1 : -1

      switch (sortBy) {
        case 'description':
          return a.description.localeCompare(b.description) * direction
        case 'categoryName':
          return (a.categoryName ?? '').localeCompare(b.categoryName ?? '') * direction
        case 'type':
          return a.type.localeCompare(b.type) * direction
        case 'amountCents':
          return (a.amountCents - b.amountCents) * direction
        case 'date':
        default: {
          const aDate = typeof a.date === 'string' ? a.date : a.date.toISOString()
          const bDate = typeof b.date === 'string' ? b.date : b.date.toISOString()
          return aDate.localeCompare(bDate) * direction
        }
      }
    }

    const deduped = new Map<string, Props['transactions'][number]>()

    for (const transaction of createdTransactions) {
      if (matchesFilters(transaction)) {
        deduped.set(transaction.id, transaction)
      }
    }

    for (const transaction of transactions) {
      if (!deduped.has(transaction.id)) {
        deduped.set(transaction.id, transaction)
      }
    }

    return Array.from(deduped.values()).sort(compare)
  }, [activeCategoryIds, activeTypes, inlineForm?.createdTransactions, searchParams, sortBy, sortDir, transactions])

  return (
    <TransactionList
      transactions={visibleTransactions}
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
