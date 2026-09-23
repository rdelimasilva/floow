'use server'
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { getDb, transactions, accounts, categories } from '@floow/db'
import { getOrgId } from './queries'
import { effectiveAffectsCashFlow } from '@/lib/finance/affects-cash-flow'

export interface PacingTransaction {
  id: string
  date: string
  description: string
  /** Positivo = gasto; negativo = estorno que abate o teto. */
  spentCents: number
  categoryName: string | null
  accountName: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MONTH_RE = /^(\d{4})-(\d{2})-01$/

/**
 * As transações que compõem o gasto de uma categoria no Ritmo de gastos.
 *
 * Os filtros são os mesmos de getDailySpending — se divergirem, a soma do popup
 * deixa de bater com o valor do card. `categoryIds` já vem com as filhas que
 * sobem para o teto (o rollup é resolvido na página).
 */
export async function getPacingCategoryTransactions(
  categoryIds: string[],
  month: string,
): Promise<PacingTransaction[]> {
  const m = MONTH_RE.exec(month)
  if (!m) throw new Error('Mês inválido')
  const ids = categoryIds.filter((id) => UUID_RE.test(id)).slice(0, 200)
  if (ids.length === 0) return []

  const orgId = await getOrgId()
  const y = Number(m[1])
  const mo = Number(m[2])
  const start = new Date(Date.UTC(y, mo - 1, 1))
  const end = new Date(Date.UTC(y, mo, 0))

  const rows = await getDb()
    .select({
      id: transactions.id,
      date: sql<string>`to_char(${transactions.date}, 'YYYY-MM-DD')`,
      description: transactions.description,
      amountCents: transactions.amountCents,
      categoryName: categories.name,
      accountName: accounts.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.type, 'expense'),
        eq(transactions.reviewState, 'confirmed'),
        eq(transactions.isIgnored, false),
        effectiveAffectsCashFlow,
        inArray(transactions.categoryId, ids),
        gte(transactions.date, start),
        lte(transactions.date, end),
      ),
    )
    .orderBy(desc(transactions.date), asc(transactions.amountCents))

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    description: r.description,
    spentCents: -r.amountCents,
    categoryName: r.categoryName,
    accountName: r.accountName,
  }))
}
