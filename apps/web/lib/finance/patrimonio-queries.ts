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
 *
 * `lerPosicoes` troca só a leitura das posições, que por padrão passa pelo RLS
 * do usuário da requisição: o cron, sem sessão, injeta a leitura direta.
 */
export async function getPatrimonioAtual(
  orgId: string,
  lerPosicoes: (orgId: string) => Promise<Map<string, number>> = getValorDasContasDeInvestimento,
): Promise<Patrimonio> {
  const [contas, valorDasPosicoes, imobilizadoCents] = await Promise.all([
    getAccounts(orgId),
    lerPosicoes(orgId),
    getValorDoImobilizado(orgId),
  ])
  return calcularPatrimonio(contas, valorDasPosicoes, imobilizadoCents)
}
