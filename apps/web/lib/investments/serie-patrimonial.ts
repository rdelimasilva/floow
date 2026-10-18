import { formatarDia } from '@/lib/formatar-dia'
import { formatarNumero } from '@/lib/formatar-numero'

export interface SnapshotDoGrafico {
  snapshotDate: string | Date
  createdAt: string | Date
  netWorthCents: number
}

export interface PontoMensal {
  /** 'YYYY-MM' */
  mes: string
  /** Rótulo do eixo X: 'mar. de 26'. */
  date: string
  /** Último snapshot do mês; null quando o mês não tem snapshot. */
  netWorthCents: number | null
}

const chaveDoMes = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
const tempo = (d: string | Date) => new Date(d).getTime()

/**
 * Um ponto por mês, do mês do primeiro snapshot até o mês de `hoje`. O valor
 * é o último snapshot do mês (por data, depois por criação — o mesmo dia pode
 * ter vários). Mês sem snapshot fica no eixo com valor null: o buraco aparece
 * em vez de o eixo pular de abril para setembro.
 *
 * Datas em UTC, como `formatarDia`: coluna `date` chega à meia-noite UTC.
 */
export function serieMensalDoPatrimonio(snapshots: SnapshotDoGrafico[], hoje: Date = new Date()): PontoMensal[] {
  if (snapshots.length === 0) return []

  const ordenados = [...snapshots].sort((a, b) =>
    tempo(a.snapshotDate) - tempo(b.snapshotDate) || tempo(a.createdAt) - tempo(b.createdAt))
  const ultimoDoMes = new Map<string, number>()
  for (const s of ordenados) ultimoDoMes.set(chaveDoMes(new Date(s.snapshotDate)), s.netWorthCents)

  const primeiro = new Date(ordenados[0].snapshotDate)
  const fim = Math.max(tempo(hoje), tempo(ordenados[ordenados.length - 1].snapshotDate))
  const serie: PontoMensal[] = []
  for (let d = new Date(Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth(), 1)); d.getTime() <= fim;
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const mes = chaveDoMes(d)
    serie.push({ mes, date: formatarDia(d, { month: 'short', year: '2-digit' }), netWorthCents: ultimoDoMes.get(mes) ?? null })
  }
  return serie
}

/** Valor em centavos -> 'R$ 621 mil' / 'R$ 1,5 mi', curto para o eixo Y. */
export function rotuloDoEixoY(cents: number): string {
  const sinal = cents < 0 ? '-' : ''
  const reais = Math.abs(cents) / 100
  if (reais >= 1_000_000) return `${sinal}R$ ${formatarNumero(reais / 1_000_000, 1)} mi`
  if (reais >= 1_000) return `${sinal}R$ ${formatarNumero(Math.round(reais / 1_000), 0)} mil`
  return `${sinal}R$ ${formatarNumero(Math.round(reais), 0)}`
}
