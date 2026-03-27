'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useContext, useMemo } from 'react'
import { TransactionList } from './transaction-list'
import { currencyToCents } from '@floow/core-finance'
import { InlineFormContext, type InlineCreatedTransaction } from './inline-transaction-form'

interface Props {
  transactions: Parameters<typeof TransactionList>[0]['transactions']
  accounts: Parameters<typeof TransactionList>[0]['accounts']
  categories: Parameters<typeof TransactionList>[0]['categories']
  sortBy: string
  sortDir: 'asc' | 'desc'
  startingBalance: number
}

export function TransactionListWrapper({ transactions, accounts, categories, sortBy, sortDir, startingBalance }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inlineForm = useContext(InlineFormContext)

  const navigate = useCallback((overrides: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    params.set('page', '1')
    router.replace(`/transactions?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  const activeTypes = (searchParams.get('types') ?? '').split(',').filter(Boolean)
  const activeCategoryIds = (searchParams.get('categoryIds') ?? '').split(',').filter(Boolean)
  const activeMinAmount = searchParams.get('minAmount') ?? ''
  const activeMaxAmount = searchParams.get('maxAmount') ?? ''

  const visibleTransactions = useMemo(() => {
    const createdTransactions = inlineForm?.createdTransactions ?? []
    if (createdTransactions.length === 0) return transactions

    const matchesFilters = (transaction: InlineCreatedTransaction) => {
      const accountId = searchParams.get('accountId')
      const search = searchParams.get('search')?.toLowerCase()
      const startDate = searchParams.get('startDate')
      const endDate = searchParams.get('endDate')
      const minAmount = searchParams.get('minAmount')
      const maxAmount = searchParams.get('maxAmount')
      const dateKey = typeof transaction.date === 'string'
        ? transaction.date.split('T')[0]
        : transaction.date.toISOString().split('T')[0]
      const amountAbs = Math.abs(transaction.amountCents)

      if (accountId && transaction.accountId !== accountId) return false
      if (search && !transaction.description.toLowerCase().includes(search)) return false
      if (startDate && dateKey < startDate) return false
      if (endDate && dateKey > endDate) return false
      if (activeTypes.length > 0 && !activeTypes.includes(transaction.type)) return false
      if (activeCategoryIds.length > 0 && (!transaction.categoryId || !activeCategoryIds.includes(transaction.categoryId))) return false
      if (minAmount && amountAbs < Number(minAmount)) return false
      if (maxAmount && amountAbs > Number(maxAmount)) return false

      return true
    }

    const compare = (a: Props['transactions'][number], b: Props['transactions'][number]) => {
      const direction = sortDir === 'asc' ? 1 : -1
      if ((a.balanceApplied ?? true) !== (b.balanceApplied ?? true)) {
        return (a.balanceApplied === false ? 1 : -1) - (b.balanceApplied === false ? 1 : -1)
      }

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

    const merged = [
      ...createdTransactions.filter(matchesFilters),
      ...transactions,
    ]

    const deduped = merged.filter((transaction, index, array) =>
      array.findIndex((candidate) => candidate.id === transaction.id) === index
    )

    return deduped.sort(compare)
  }, [activeCategoryIds, activeTypes, inlineForm?.createdTransactions, searchParams, sortBy, sortDir, transactions])

  return (
    <TransactionList
      transactions={visibleTransactions}
      accounts={accounts}
      categories={categories}
      sortBy={sortBy}
      sortDir={sortDir}
      startingBalance={startingBalance}
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
