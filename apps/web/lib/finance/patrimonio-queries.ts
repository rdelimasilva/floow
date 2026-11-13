import { estimateAssetValue } from '@floow/core-finance'
import { getAccounts } from './queries'
import { getFaturasAbertas } from './queries-fatura'
import { getValorDasContasDeInvestimento } from '@/lib/openfinance/queries'
import { getFixedAssets } from '@/lib/fixed-assets/queries'
import { calcularPatrimonio, type Patrimonio } from './patrimonio'

/** Valor estimado hoje dos bens do imobilizado. Falha de leitura vale 0. */
async function getValorDoImobilizado(orgId: string): Promise<number> {
  try {
    const bens = await getFixedAssets(orgId)
    const hoje = new Date()
    return bens.reduce((sum, a) => {
      const base = a.currentValueDate instanceof Date ? a.currentValueDate : new Date(a.currentValueDate)
      return sum + estimateAssetValue(a.currentValueCents, base, Number(a.annualRate), hoje)
    }, 0)
  } catch {
    return 0
  }
}

/**
 * Patrimônio de agora, com as mesmas fontes da tela Contas: saldo das contas,
 * nas de investimento do Open Finance o valor das posições e no cartão a
 * fatura aberta, que bate com o banco; o saldo de lançamentos do cartão não
 * bate e deixava o Dashboard diferente da tela Contas.
 *
 * `lerPosicoes` e `lerFaturas` por padrão passam pelo RLS do usuário da
 * requisição: o cron, sem sessão, injeta a leitura direta.
 */
export async function getPatrimonioAtual(
  orgId: string,
  lerPosicoes: (orgId: string) => Promise<Map<string, number>> = getValorDasContasDeInvestimento,
  lerFaturas: typeof getFaturasAbertas = getFaturasAbertas,
): Promise<Patrimonio> {
  const [contas, valorDasPosicoes, imobilizadoCents] = await Promise.all([
    getAccounts(orgId),
    lerPosicoes(orgId),
    getValorDoImobilizado(orgId),
  ])
  const faturasAbertas = await lerFaturas(orgId, contas)
  return calcularPatrimonio(contas, new Map([...valorDasPosicoes, ...faturasAbertas]), imobilizadoCents)
}
