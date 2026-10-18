import { estimateAssetValue } from '@floow/core-finance'
import { getAccounts } from './queries'
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
 * Patrimônio de agora, com as mesmas fontes da tela Contas: saldo das contas
 * e, nas de investimento do Open Finance, o valor das posições.
 */
export async function getPatrimonioAtual(orgId: string): Promise<Patrimonio> {
  const [contas, valorDasPosicoes, imobilizadoCents] = await Promise.all([
    getAccounts(orgId),
    getValorDasContasDeInvestimento(orgId),
    getValorDoImobilizado(orgId),
  ])
  return calcularPatrimonio(contas, valorDasPosicoes, imobilizadoCents)
}
