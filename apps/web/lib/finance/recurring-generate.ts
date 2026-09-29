import { getDb, transactions, recurringTemplates } from '@floow/db'
import { matchCategory, advanceByFrequency, getOverdueDates } from '@floow/core-finance'
import { eq, and } from 'drizzle-orm'
import { getCategoryRules } from './queries'

/**
 * Gera as ocorrências vencidas de um template (não é server action). Saiu de
 * `recurring-actions.ts`, que estava em 498 linhas com o limite em 500.
 */
export async function generateForTemplate(templateId: string, orgId: string): Promise<number> {
  const db = getDb()

  const [template] = await db
    .select()
    .from(recurringTemplates)
    .where(and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, orgId)))
    .limit(1)

  if (!template || !template.isActive) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdueDates = getOverdueDates(template.nextDueDate, template.frequency as any, today)
  if (overdueDates.length === 0) return 0

  let resolvedCategoryId = template.categoryId
  let isAutoCategorized = false
  if (!resolvedCategoryId && template.description) {
    const rules = await getCategoryRules(orgId)
    const enabledRules = rules.filter((r: any) => r.isEnabled)
    const matched = matchCategory(template.description, enabledRules)
    if (matched) {
      resolvedCategoryId = matched
      isAutoCategorized = true
    }
  }

  const signedAmount = template.type === 'income' ? template.amountCents : -template.amountCents
  let generated = 0

  await db.transaction(async (tx) => {
    for (const dueDate of overdueDates) {
      const result = await tx
        .insert(transactions)
        .values({
          orgId,
          accountId: template.accountId,
          categoryId: resolvedCategoryId,
          type: template.type as any,
          amountCents: signedAmount,
          description: template.description,
          date: dueDate,
          recurringTemplateId: template.id,
          origem: 'recorrencia',
          // Previsao NUNCA sensibiliza `accounts.balance_cents`. Antes esta
          // linha omitia o campo, pegava o default `true` da coluna e somava
          // o valor no saldo logo abaixo — 41 linhas e R$ 126.746,00 de
          // estimativa dentro do saldo de uma conta cujo saldo real era
          // R$ 190,84, com 21 delas contando dobrado junto com o realizado
          // que o banco trouxe. Quem soma no saldo e o lancamento do banco;
          // esta linha espera ser casada com ele.
          balanceApplied: false,
          isAutoCategorized,
        })
        .onConflictDoNothing()
        .returning({ id: transactions.id })

      if (result.length > 0) generated++
    }

    const lastDate = overdueDates[overdueDates.length - 1]
    const newNextDueDate = advanceByFrequency(lastDate, template.frequency as any)
    await tx
      .update(recurringTemplates)
      .set({ nextDueDate: newNextDueDate, updatedAt: new Date() })
      .where(eq(recurringTemplates.id, template.id))
  })

  return generated
}
