import { cache } from 'react'
import { getGastosDosCartoes, janelaDasFaturas } from './queries-gastos-cartao'
import { hojeEmSaoPaulo } from './filtros-lembrados'
import { contasDoFiltro } from './filtro-de-contas'

/**
 * O período com que Cartões mostraria a fatura. Na janela padrão (últimas 12),
 * a mesma busca da tela; antes dela, a partir do mês anterior ao fechamento.
 * Janela mais curta que a da tela muda o voto do `bill_id` (`ciclosDasCompras`)
 * e a lista deixaria de bater com a barra.
 */
export function periodoDaBusca(fechamento: string, hoje: string): { inicio: string; fim: string } {
  if (fechamento >= janelaDasFaturas('', '', hoje).primeiroFechamento) return { inicio: '', fim: '' }
  const d = new Date(`${fechamento.slice(0, 7)}-01T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return { inicio: d.toISOString().slice(0, 10), fim: fechamento }
}

/**
 * Ids dos lançamentos da fatura, pela mesma conta de Cartões
 * (`getGastosDosCartoes`). `null` quando a conta não é cartão com dia de
 * fechamento: aí não existe fatura para filtrar.
 */
const idsDaFatura = cache(async (orgId: string, cartaoId: string, fechamento: string): Promise<string[] | null> => {
  const cartao = (await getGastosDosCartoes(orgId, periodoDaBusca(fechamento, hojeEmSaoPaulo()))).find((c) => c.id === cartaoId)
  if (!cartao) return null
  return cartao.faturas.find((f) => f.fechamento === fechamento)?.lancamentos.map((l) => l.id) ?? []
})

/**
 * Resolve `fatura=` da URL nos ids que a lista filtra. Só vale com exatamente
 * um cartão em `accountId`; fora disso o parâmetro some, e a pílula junto,
 * para não ficar filtro escondido.
 */
export async function comFatura<T extends { accountId?: string; fatura?: string }>(
  orgId: string,
  filtros: T,
): Promise<T & { idsDaFatura?: string[] }> {
  const contas = contasDoFiltro(filtros)
  const ids = filtros.fatura && contas.length === 1 ? await idsDaFatura(orgId, contas[0], filtros.fatura) : null
  return ids ? { ...filtros, idsDaFatura: ids } : { ...filtros, fatura: undefined }
}
