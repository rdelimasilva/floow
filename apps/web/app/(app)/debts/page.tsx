import { getOrgId, getCategories } from '@/lib/finance/queries'
import { getDebtsWithProgress } from '@/lib/finance/debt-queries'
import { getParceladosNoCartao } from '@/lib/finance/parcelados-no-cartao-queries'
import { ParceladosNoCartao } from '@/components/finance/parcelados-no-cartao'
import { DebtsClient } from './client'

export default async function DebtsPage() {
  const orgId = await getOrgId()
  const [debtsData, categories, parcelados] = await Promise.all([
    getDebtsWithProgress(orgId),
    getCategories(orgId),
    getParceladosNoCartao(orgId),
  ])

  const expenseCategories = categories
    .filter((c) => c.type === 'expense')
    .map((c) => ({ id: c.id, name: c.name, parentId: c.parentId }))

  return (
    <div className="space-y-6">
      <DebtsClient
        debts={debtsData.map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          totalCents: d.totalCents,
          installments: d.installments,
          installmentCents: d.installmentCents,
          interestRate: d.interestRate,
          startDate: d.startDate.toISOString().split('T')[0],
          categoryId: d.categoryId,
          paidCount: d.paidCount,
          paidCents: d.paidCents,
          remainingCents: d.remainingCents,
          progressPct: d.progressPct,
          nextDueDate: `${d.nextDueDate.getFullYear()}-${String(d.nextDueDate.getMonth() + 1).padStart(2, '0')}-${String(d.nextDueDate.getDate()).padStart(2, '0')}`,
        }))}
        categories={expenseCategories}
      />
      <ParceladosNoCartao parcelados={parcelados} />
    </div>
  )
}
