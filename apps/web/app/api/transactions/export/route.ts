import { NextRequest, NextResponse } from 'next/server'
import { getOrgId, getTransactionsWithCount } from '@/lib/finance/queries'
import { formatBRL } from '@floow/core-finance'

const TYPE_LABELS: Record<string, string> = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
}

export async function GET(request: NextRequest) {
  try {
    const orgId = await getOrgId()
    const params = request.nextUrl.searchParams

    const filters = {
      accountId: params.get('accountId') || undefined,
      search: params.get('search') || undefined,
      startDate: params.get('startDate') || undefined,
      endDate: params.get('endDate') || undefined,
      sortBy: params.get('sortBy') || 'date',
      sortDir: params.get('sortDir') || 'desc',
      types: params.get('types') || undefined,
      categoryIds: params.get('categoryIds') || undefined,
      minAmount: params.get('minAmount') ? parseInt(params.get('minAmount')!, 10) : undefined,
      maxAmount: params.get('maxAmount') ? parseInt(params.get('maxAmount')!, 10) : undefined,
    }

    // Fetch all matching transactions (no pagination limit)
    const { transactions } = await getTransactionsWithCount(orgId, {
      limit: 10000,
      offset: 0,
      ...filters,
    })

    // Build CSV
    const header = 'Data,Descrição,Categoria,Tipo,Valor'
    const rows = transactions.map((tx) => {
      const date = tx.date instanceof Date
        ? tx.date.toLocaleDateString('pt-BR')
        : new Date(tx.date).toLocaleDateString('pt-BR')
      const desc = `"${(tx.description ?? '').replace(/"/g, '""')}"`
      const cat = tx.categoryName ? `"${tx.categoryName.replace(/"/g, '""')}"` : ''
      const type = TYPE_LABELS[tx.type] ?? tx.type
      const amount = formatBRL(tx.amountCents)

      return `${date},${desc},${cat},${type},${amount}`
    })

    const csv = '\uFEFF' + [header, ...rows].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="transacoes.csv"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Erro ao exportar' }, { status: 500 })
  }
}
