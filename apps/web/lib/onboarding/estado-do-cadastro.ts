import { getAccounts } from '@/lib/finance/queries'
import { hasAnyTransaction } from '@/lib/finance/queries-transactions'
import { getBankConnections } from '@/lib/openfinance/queries'
import type { EstadoDoCadastro } from './primeiros-passos'

/** O que já existe na org, para o guia saber o que está feito. */
export async function getEstadoDoCadastro(orgId: string): Promise<Omit<EstadoDoCadastro, 'pulados'>> {
  const [contas, temLancamento, conexoes] = await Promise.all([
    getAccounts(orgId),
    hasAnyTransaction(orgId),
    getBankConnections(orgId),
  ])
  return {
    tiposDeConta: Array.from(new Set(contas.map((c) => c.type))),
    temConexao: conexoes.length > 0,
    temLancamento,
  }
}
