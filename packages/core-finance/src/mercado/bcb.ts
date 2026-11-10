import { z } from 'zod'
import { dataBr } from './util'

export type Serie = 'cdi' | 'selic' | 'ipca'

/** Séries do SGS: CDI e Selic diárias (% ao dia), IPCA mensal (% ao mês). */
export const CODIGOS_SGS: Record<Serie, number> = { cdi: 12, selic: 11, ipca: 433 }

export type Indicador = { serie: Serie; data: string; valor: number }

const Resposta = z.array(z.object({ data: z.string(), valor: z.string() }))

export function parseSgs(serie: Serie, json: unknown): { linhas: Indicador[]; invalidas: number } {
  const r = Resposta.safeParse(json)
  if (!r.success) throw new Error(`SGS: resposta fora do formato para ${serie}`)
  const linhas: Indicador[] = []
  let invalidas = 0
  for (const item of r.data) {
    const data = dataBr(item.data)
    // O SGS manda ponto decimal, então Number direto.
    const valor = Number(item.valor)
    if (!data || !item.valor.trim() || !Number.isFinite(valor)) invalidas++
    else linhas.push({ serie, data, valor })
  }
  return { linhas, invalidas }
}
