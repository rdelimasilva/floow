import { eq } from 'drizzle-orm'
import { openfinanceConnections, type getDb } from '@floow/db'
import type { PolpClient } from '@floow/core-finance'
import { syncConnectionTransactions, type SyncSummary } from './sync'
import { criarRepositorio } from './investimentos/repositorio'
import { sincronizarInvestimentos, type ResumoDeInvestimentos } from './investimentos/sincronizar'

type Db = ReturnType<typeof getDb>

/**
 * Tudo que uma conexão traz: lançamentos e, se o consentimento pediu,
 * investimentos. Ponto de entrada do botão; o cron chama as duas metades
 * separadas, para todos os extratos entrarem antes de qualquer investimento.
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
  const investimentos = await sincronizarInvestimentosDaConexao(db, client, conexao)
  return { ...lancamentos, investimentos }
}

/**
 * Investimentos de uma conexão. Nunca lança: uma falha aqui (inclusive na
 * leitura de `dados`) não pode derrubar o extrato que já foi importado — por
 * isso um try único cobrindo a leitura, o filtro e a sincronização. Devolve
 * null quando não há investimento a sincronizar ou quando falhou (e loga).
 */
export async function sincronizarInvestimentosDaConexao(
  db: Db,
  client: PolpClient,
  conexao: { id: string; orgId: string },
): Promise<ResumoDeInvestimentos | null> {
  try {
    const [dados] = await db
      .select({
        polpConsentId: openfinanceConnections.polpConsentId,
        institutionName: openfinanceConnections.institutionName,
        products: openfinanceConnections.products,
      })
      .from(openfinanceConnections)
      .where(eq(openfinanceConnections.id, conexao.id))
      .limit(1)

    // Só evita montar o repositório à toa: quem decide de verdade é
    // `sincronizarInvestimentos`, que confere o produto de novo.
    if (!dados?.products.includes('INVESTMENTS')) return null

    return await sincronizarInvestimentos(criarRepositorio(db), client, { ...conexao, ...dados })
  } catch (error) {
    console.error(`[openfinance] investimentos falharam para conexao=${conexao.id} org=${conexao.orgId}:`, error)
    return null
  }
}
