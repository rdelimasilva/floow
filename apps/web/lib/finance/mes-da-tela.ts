import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { destinoComRecorte, lerRecorte, mesParaTelaDeMes } from '@/lib/finance/recorte'

const MES = /^\d{4}-\d{2}/

/**
 * Mês ("YYYY-MM-01") de uma tela de mês. `month` válido na URL vale; ausente ou
 * inválido abre no mês do recorte (redirect). Sem recorte, `padrao`.
 */
export async function mesDaTela(
  path: string,
  params: Record<string, string | undefined>,
  padrao: () => string = () => mesParaTelaDeMes(null),
): Promise<string> {
  if (MES.test(params.month ?? '')) return `${params.month!.slice(0, 7)}-01`
  const jar = await cookies()
  const lidos = Object.fromEntries(jar.getAll().map((c) => [c.name, c.value]))
  // `month` inválido conta como ausente: sem isto o redirect não aconteceria.
  const destino = destinoComRecorte(path, { ...params, month: undefined }, lerRecorte(lidos), 'mes')
  if (destino) redirect(destino)
  return padrao()
}
