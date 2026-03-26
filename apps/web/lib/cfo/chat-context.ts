import { getDb, cfoInsights, cfoRuns, transactions, accounts } from '@floow/db'
import { eq, and, isNull, gt, desc, sql, gte } from 'drizzle-orm'
import { aggregateCashFlow } from '@floow/core-finance'
import type { CfoInsight } from '@floow/db'

const CHAT_SYSTEM_PROMPT = `Você é o Consultor Financeiro pessoal do usuário. Você tem acesso aos dados financeiros dele e pode ajudá-lo a tomar melhores decisões.

Regras:
- Seja direto e objetivo. Nada de jargão desnecessário.
- Use tom firme mas empático — como um amigo que entende de finanças.
- Nunca invente dados. Trabalhe apenas com os números fornecidos no contexto.
- Se não tiver dados suficientes para responder, diga isso claramente.
- Quando sugerir ações, use as tools disponíveis para que o usuário possa executar com um clique.
- Responda SEMPRE em português brasileiro.
- Respostas curtas e práticas — máximo 3 parágrafos.`

export async function buildChatSystemPrompt(
  orgId: string,
  insightContext?: CfoInsight,
): Promise<string> {
  const db = getDb()

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const recentTx = await db
    .select({ date: transactions.date, amountCents: transactions.amountCents, type: transactions.type })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), gte(transactions.date, sixMonthsAgo)))

  const cashFlow = aggregateCashFlow(recentTx)
  const latest = cashFlow[0]

  const accts = await db.select().from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
  const totalBalance = accts.reduce((s, a) => s + a.balanceCents, 0)

  const activeInsights = await db
    .select({ type: cfoInsights.type, severity: cfoInsights.severity, title: cfoInsights.title, body: cfoInsights.body })
    .from(cfoInsights)
    .where(and(
      eq(cfoInsights.orgId, orgId),
      isNull(cfoInsights.dismissedAt),
      gt(cfoInsights.expiresAt, sql`now()`),
    ))
    .orderBy(desc(cfoInsights.generatedAt))
    .limit(5)

  const [latestRun] = await db
    .select({ dailySummary: cfoRuns.dailySummary })
    .from(cfoRuns)
    .where(eq(cfoRuns.orgId, orgId))
    .orderBy(desc(cfoRuns.startedAt))
    .limit(1)

  let context = CHAT_SYSTEM_PROMPT
  context += `\n\n## Contexto Financeiro do Usuário`
  context += `\n- Receita mensal: R$${((latest?.income ?? 0) / 100).toFixed(0)}`
  context += `\n- Despesa mensal: R$${(Math.abs(latest?.expense ?? 0) / 100).toFixed(0)}`
  context += `\n- Saldo total em contas: R$${(totalBalance / 100).toFixed(0)}`

  if (latestRun?.dailySummary) {
    context += `\n\n## Resumo do Dia\n${latestRun.dailySummary}`
  }

  if (activeInsights.length > 0) {
    context += `\n\n## Insights Ativos`
    for (const insight of activeInsights) {
      context += `\n- [${insight.severity}] ${insight.title}: ${insight.body}`
    }
  }

  if (insightContext) {
    context += `\n\n## Insight em Discussão`
    context += `\n- Tipo: ${insightContext.type}`
    context += `\n- Severidade: ${insightContext.severity}`
    context += `\n- ${insightContext.title}: ${insightContext.body}`
    if (insightContext.metric) {
      context += `\n- Dados: ${JSON.stringify(insightContext.metric)}`
    }
  }

  return context
}
