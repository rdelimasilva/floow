import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { destinoComRecorte, diaExiste, lerRecorte, mesParaTelaDeMes } from '@/lib/finance/recorte'

/**
 * Mês ("YYYY-MM-01") de uma tela de mês. `month` válido na URL vale; ausente ou
 * inválido abre no mês do recorte (redirect). Sem recorte, `padrao`.
 */
export async function mesDaTela(
  path: string,
  params: Record<string, string | undefined>,
  padrao: () => string = () => mesParaTelaDeMes(null),
  soComFim = false,
): Promise<string> {
  const mes = `${(params.month ?? '').slice(0, 7)}-01`
  if (diaExiste(mes)) return mes
  const jar = await cookies()
  const lidos = Object.fromEntries(jar.getAll().map((c) => [c.name, c.value]))
  const lido = lerRecorte(lidos)
  // Recorte de ponta aberta não define um mês: a tela fica com a própria regra.
  const recorte = soComFim && !lido?.endDate ? null : lido
  // `month` inválido conta como ausente: sem isto o redirect não aconteceria.
  const destino = destinoComRecorte(path, { ...params, month: undefined }, recorte, 'mes')
  if (destino) redirect(destino)
  return padrao()
}
