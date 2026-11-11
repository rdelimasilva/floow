import { getOrgId, getCategories } from '@/lib/finance/queries'
import { getDebtsWithProgress } from '@/lib/finance/debt-queries'
import { getParceladosNoCartao } from '@/lib/finance/parcelados-no-cartao-queries'
import { ParceladosNoCartao } from '@/components/finance/parcelados-no-cartao'
import { hojeEmSaoPaulo } from '@/lib/openfinance/parcelas-previstas'
import { mesDaTela } from '@/lib/finance/mes-da-tela'
import { DebtsClient } from './client'

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function DebtsPage({ searchParams }: Props) {
  const params = await searchParams
  // Com recorte, abre no mês dele (redirect antes de consultar o banco).
  const mesDaUrl = await mesDaTela('/debts', params, () => '')
  const orgId = await getOrgId()
  const [debtsData, categories, parcelados] = await Promise.all([
    getDebtsWithProgress(orgId),
    getCategories(orgId),
    getParceladosNoCartao(orgId),
  ])

  // Sem recorte nem `?month=`, abre na próxima fatura com parcela (a lista vem ordenada por vencimento).
  const proximaFatura = parcelados[0]?.nextDueDate ?? hojeEmSaoPaulo()
  const selectedMonth = mesDaUrl || `${proximaFatura.slice(0, 7)}-01`

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
      <ParceladosNoCartao parcelados={parcelados} selectedMonth={selectedMonth} />
    </div>
  )
}
