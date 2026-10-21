'use server'
import { and, eq, sql } from 'drizzle-orm'
import { transactions, accounts, categories, type OrigemDaTransacao } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { getOrgId } from './queries'

export interface DetalheDoLancamento {
  id: string
  date: string
  description: string
  amountCents: number
  type: string
  accountId: string
  accountName: string
  categoryName: string | null
  origem: OrigemDaTransacao
  /** false = previsto, ainda fora do saldo. */
  balanceApplied: boolean
  recorrente: boolean
  installmentNumber: number | null
  installmentTotal: number | null
  purchaseDate: string | null
  cardLastDigits: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Um lançamento do Fluxo de Caixa, para o popup de detalhes. Null se não for da org. */
export async function getDetalheDoLancamento(id: string): Promise<DetalheDoLancamento | null> {
  if (!UUID_RE.test(id)) throw new Error('Lançamento inválido')
  const orgId = await getOrgId()

  const [row] = await withUserDb((db) =>
    db
      .select({
        id: transactions.id,
        date: sql<string>`to_char(${transactions.date}, 'YYYY-MM-DD')`,
        description: transactions.description,
        amountCents: transactions.amountCents,
        type: transactions.type,
        accountId: transactions.accountId,
        accountName: accounts.name,
        categoryName: categories.name,
        origem: transactions.origem,
        balanceApplied: transactions.balanceApplied,
        recurringTemplateId: transactions.recurringTemplateId,
        installmentNumber: transactions.installmentNumber,
        installmentTotal: transactions.installmentTotal,
        purchaseDate: sql<string | null>`to_char(${transactions.purchaseDate}, 'YYYY-MM-DD')`,
        cardLastDigits: transactions.cardLastDigits,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(eq(transactions.id, id), eq(transactions.orgId, orgId)))
      .limit(1),
  )
  if (!row) return null

  const { recurringTemplateId, ...resto } = row
  return { ...resto, recorrente: recurringTemplateId !== null }
}
