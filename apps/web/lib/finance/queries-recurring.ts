import { getDb, recurringTemplates, transactions } from '@floow/db'
import { eq, and, asc, lte, isNotNull, isNull, sql } from 'drizzle-orm'

/**
 * Returns all recurring templates for an org, ordered by nextDueDate ASC.
 */
export async function getRecurringTemplates(orgId: string) {
  const db = getDb()
  return db
    .select()
    .from(recurringTemplates)
    .where(eq(recurringTemplates.orgId, orgId))
    .orderBy(asc(recurringTemplates.nextDueDate))
}

/**
 * Returns active templates due within the next 30 days, ordered by nextDueDate ASC.
 * Used for the "upcoming due" section on /transactions/recurring.
 */
export async function getUpcomingRecurring(orgId: string) {
  const db = getDb()
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000)

  return db
    .select()
    .from(recurringTemplates)
    .where(
      and(
        eq(recurringTemplates.orgId, orgId),
        eq(recurringTemplates.isActive, true),
        lte(recurringTemplates.nextDueDate, thirtyDaysFromNow),
      )
    )
    .orderBy(asc(recurringTemplates.nextDueDate))
}

/**
 * Por template, a próxima parcela em aberto e a última parcela gerada, como
 * 'YYYY-MM-DD'.
 *
 * `next_due_date` não serve para mostrar nenhuma das duas: como as parcelas
 * nascem todas na criação, ele aponta para um período depois da última.
 * A "próxima" usa o mesmo recorte de `condicoesDeParcelasPendentes` (o que a
 * edição move), para a data que a tela mostra ser a que o campo altera.
 */
export async function getDatasDasParcelas(orgId: string, hojeStr: string) {
  const db = getDb()
  const pendente = and(
    eq(transactions.balanceApplied, false),
    isNull(transactions.matchedTransactionId),
    eq(transactions.isIgnored, false),
    sql`${transactions.date} >= ${hojeStr}::date`,
  )

  const linhas = await db
    .select({
      templateId: transactions.recurringTemplateId,
      proxima: sql<string | null>`to_char(min(${transactions.date}) filter (where ${pendente}), 'YYYY-MM-DD')`,
      ultima: sql<string | null>`to_char(max(${transactions.date}), 'YYYY-MM-DD')`,
    })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), isNotNull(transactions.recurringTemplateId)))
    .groupBy(transactions.recurringTemplateId)

  return new Map(linhas.map((l) => [l.templateId!, { proxima: l.proxima, ultima: l.ultima }]))
}
