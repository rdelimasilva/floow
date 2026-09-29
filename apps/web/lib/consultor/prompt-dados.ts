import { cfoInsights, type CfoInsight } from '@floow/db'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { withUserDbFor } from '@/lib/db/rls'
import { getAccounts } from '@/lib/finance/queries-accounts'
import { getCategories } from '@/lib/finance/queries-categories'
import { listarMemorias } from '@/lib/consultor/memorias'
import type { DadosDoPrompt } from './prompt'

/**
 * Nomes de contas e categorias vão no prompt para o Claude acertar os filtros
 * das ferramentas.
 *
 * `userId` explícito (em vez de resolver via sessão): o WhatsApp (fase 3) não
 * tem cookies para `requireIdentity()` ler.
 */
export async function carregarDadosDoPrompt(
  orgId: string,
  userId: string,
  canal: DadosDoPrompt['canal'],
  insight?: CfoInsight,
): Promise<DadosDoPrompt> {
  const [contas, categorias, insights, memorias] = await Promise.all([
    getAccounts(orgId),
    getCategories(orgId),
    withUserDbFor(userId, (tx) =>
      tx
        .select({ severity: cfoInsights.severity, title: cfoInsights.title, body: cfoInsights.body })
        .from(cfoInsights)
        .where(and(eq(cfoInsights.orgId, orgId), isNull(cfoInsights.dismissedAt), gt(cfoInsights.expiresAt, sql`now()`)))
        .orderBy(desc(cfoInsights.generatedAt))
        .limit(5),
    ),
    listarMemorias(orgId, userId),
  ])
  return {
    canal,
    hoje: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
    contas: contas.map((c) => c.name),
    categorias: categorias.map((c) => c.name),
    insights,
    insight: insight
      ? { type: insight.type, severity: insight.severity, title: insight.title, body: insight.body, metric: insight.metric ?? undefined }
      : undefined,
    memorias: memorias.map((m) => ({ id: m.id, conteudo: m.conteudo })),
  }
}
