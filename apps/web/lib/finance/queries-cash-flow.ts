import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getDb, transactions, categories } from '@floow/db'
import { sql } from 'drizzle-orm'
import { futureTransactionsTag, recentTransactionsTag } from '@/lib/cache-tags'

export interface MonthlyCashFlowSummary {
  month: string
  income: number
  expense: number
  net: number
}

async function loadMonthlyCashFlowSummary(
  orgId: string,
  months: number,
  projected: boolean,
): Promise<MonthlyCashFlowSummary[]> {
  const db = getDb()
  const boundaryDate = new Date()

  if (projected) {
    boundaryDate.setMonth(boundaryDate.getMonth() + months)
  } else {
    boundaryDate.setMonth(boundaryDate.getMonth() - months)
  }
  const boundaryDateStr = boundaryDate.toISOString().split('T')[0]

  const rows = await db.execute<{
    month: string
    income: number
    expense: number
  }>(sql`
    select
      to_char(date_trunc('month', ${transactions.date}), 'YYYY-MM') as month,
      coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountCents} else 0 end), 0)::int as income,
      coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountCents} else 0 end), 0)::int as expense
    from ${transactions}
    left join ${categories} on ${categories.id} = ${transactions.categoryId}
    where ${transactions.orgId} = ${orgId}
      and ${transactions.isIgnored} = false
      and ${transactions.reviewState} = 'confirmed'
      and ${transactions.balanceApplied} = ${!projected}
      -- affects_cash_flow efetivo: o do lançamento manda quando preenchido, o
      -- da categoria é o padrão, e o terceiro argumento cobre lançamento sem
      -- categoria — o left join devolve NULL nos dois e o default tem que ser
      -- o comportamento de hoje, contar.
      and coalesce(${transactions.affectsCashFlow}, ${categories.affectsCashFlow}, true)
      and ${projected
        ? sql`${transactions.date} <= ${boundaryDateStr}::date`
        : sql`${transactions.date} >= ${boundaryDateStr}::date`}
    group by 1
    order by 1 desc
  `)

  return rows.map((row) => ({
    month: row.month,
    income: Number(row.income),
    expense: Number(row.expense),
    net: Number(row.income) + Number(row.expense),
  }))
}
export const getMonthlyCashFlowSummary = cache(async function getMonthlyCashFlowSummary(
  orgId: string,
  months: number = 6,
): Promise<MonthlyCashFlowSummary[]> {
  return unstable_cache(
    async () => loadMonthlyCashFlowSummary(orgId, months, false),
    ['finance-monthly-cash-flow-summary', orgId, String(months)],
    { tags: [recentTransactionsTag(orgId, months)], revalidate: 180 },
  )()
})

export const getFutureMonthlyCashFlowSummary = cache(async function getFutureMonthlyCashFlowSummary(
  orgId: string,
  months: number = 24,
): Promise<MonthlyCashFlowSummary[]> {
  return unstable_cache(
    async () => loadMonthlyCashFlowSummary(orgId, months, true),
    ['finance-future-monthly-cash-flow-summary', orgId, String(months)],
    { tags: [futureTransactionsTag(orgId, months)], revalidate: 180 },
  )()
})
