import Link from 'next/link'
import { getOrgId, getAccounts, getCategories } from '@/lib/finance/queries'
import { TransactionForm } from '@/components/finance/transaction-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function NewTransactionPage() {
  const orgId = await getOrgId()
  const [accounts, categories] = await Promise.all([
    getAccounts(orgId),
    getCategories(orgId),
  ])

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/transactions" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Transações
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova Transação</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionForm accounts={accounts} categories={categories} />
        </CardContent>
      </Card>
    </div>
  )
}
