import { cfoInsights, type getDb } from '@floow/db'
import { and, eq, gt, inArray, isNull } from 'drizzle-orm'
import type { InsightCategory, InsightResult } from '@floow/core-finance'

type Db = ReturnType<typeof getDb>

export interface SubstituirInsightsInput {
  orgId: string
  /** Categorias que a execução analisou — só elas são substituídas. */
  categorias: InsightCategory[]
  insights: InsightResult[]
  /** Evento que disparou a execução (cron_daily, budget_changed...). */
  source: string
  agora: Date
  expiraEm: (severity: string) => Date
}

/**
 * Grava o resultado de uma execução do engine como a análise vigente das
 * categorias que ela rodou.
 *
 * Antes cada execução só inseria, e a tela — que mostra todo insight não
 * vencido — acumulava uma cópia por execução: o cron diário e um
 * budget_changed no mesmo dia punham "Viagens" duas vezes.
 *
 * Por que por categoria, e não por tipo ou título: o tipo não identifica o
 * assunto (`budget_pacing_risk` sai uma vez por categoria de orçamento, e
 * `investment_concentration` uma por ativo), e o título é reescrito pelo LLM.
 * A categoria é a unidade que o engine de fato roda — um budget_changed roda
 * só `budget` —, então a execução nova responde por ela inteira. Isso também
 * apaga o insight que não se repetiu porque o problema acabou, o que uma
 * deduplicação na leitura não faria.
 *
 * Expira (expires_at = agora) em vez de apagar: conversa aberta a partir de um
 * insight guarda o id dele, e dispensado continua dispensado.
 */
export async function substituirInsights(db: Db, input: SubstituirInsightsInput): Promise<void> {
  const { orgId, categorias, insights, source, agora, expiraEm } = input
  if (categorias.length === 0) return

  await db.transaction(async (tx) => {
    await tx
      .update(cfoInsights)
      .set({ expiresAt: agora, updatedAt: agora })
      .where(
        and(
          eq(cfoInsights.orgId, orgId),
          inArray(cfoInsights.category, categorias),
          isNull(cfoInsights.dismissedAt),
          gt(cfoInsights.expiresAt, agora),
        ),
      )

    if (insights.length === 0) return

    await tx.insert(cfoInsights).values(
      insights.map((insight) => ({
        orgId,
        type: insight.type,
        category: insight.category,
        severity: insight.severity,
        title: insight.title,
        body: insight.body,
        metric: insight.metric,
        suggestedActionType: insight.suggestedAction?.type ?? null,
        suggestedActionParams: insight.suggestedAction?.params ?? null,
        source,
        generatedAt: agora,
        expiresAt: expiraEm(insight.severity),
      })),
    )
  })
}
