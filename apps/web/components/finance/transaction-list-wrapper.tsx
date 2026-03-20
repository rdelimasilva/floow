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
