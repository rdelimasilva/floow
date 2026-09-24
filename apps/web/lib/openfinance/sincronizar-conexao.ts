import { eq } from 'drizzle-orm'
import { openfinanceConnections, type getDb } from '@floow/db'
import type { PolpClient } from '@floow/core-finance'
import { syncConnectionTransactions, type SyncSummary } from './sync'
import { criarRepositorio } from './investimentos/repositorio'
import { sincronizarInvestimentos, type ResumoDeInvestimentos } from './investimentos/sincronizar'

type Db = ReturnType<typeof getDb>

/**
 * Tudo que uma conexão traz: lançamentos e, se o consentimento pediu,
 * investimentos. Um ponto de entrada só para o botão e para o cron.
 *
 * Falha de investimento não derruba o extrato — são dados independentes, e o
 * extrato é o que o orçamento consome.
 */
export async function sincronizarConexao(
  db: Db,
  client: PolpClient,
  conexao: { id: string; orgId: string },
): Promise<SyncSummary & { investimentos: ResumoDeInvestimentos | null }> {
  const lancamentos = await syncConnectionTransactions(db, client, conexao)

  const [dados] = await db
    .select({
      polpConsentId: openfinanceConnections.polpConsentId,
      institutionName: openfinanceConnections.institutionName,
      products: openfinanceConnections.products,
    })
    .from(openfinanceConnections)
    .where(eq(openfinanceConnections.id, conexao.id))
    .limit(1)

  if (!dados?.products.includes('INVESTMENTS')) return { ...lancamentos, investimentos: null }

  try {
    const investimentos = await sincronizarInvestimentos(criarRepositorio(db), client, { ...conexao, ...dados })
    return { ...lancamentos, investimentos }
  } catch (error) {
    console.error(`[openfinance] investimentos falharam para conexao=${conexao.id} org=${conexao.orgId}:`, error)
    return { ...lancamentos, investimentos: null }
  }
}
