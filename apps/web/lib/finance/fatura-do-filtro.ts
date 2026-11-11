import { cache } from 'react'
import { getGastosDosCartoes } from './queries-gastos-cartao'
import { contasDoFiltro } from './filtro-de-contas'

/**
 * Ids dos lançamentos da fatura, pela mesma conta de Cartões
 * (`getGastosDosCartoes`). `null` quando a conta não é cartão com dia de
 * fechamento: aí não existe fatura para filtrar.
 */
const idsDaFatura = cache(async (orgId: string, cartaoId: string, fechamento: string): Promise<string[] | null> => {
  const cartao = (await getGastosDosCartoes(orgId, { inicio: fechamento, fim: fechamento })).find((c) => c.id === cartaoId)
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
