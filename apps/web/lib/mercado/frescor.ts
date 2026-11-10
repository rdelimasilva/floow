import type { Job } from './repo'

const JOBS: Job[] = ['bcb', 'cvm_cotas', 'cvm_extrato', 'tesouro', 'b3']
const DIA_MS = 86_400_000

/** Dias de segunda a sexta depois de `de` até `ate`, contando o dia de `ate`. Feriado conta como útil. */
function diasUteisDepois(de: Date, ate: Date): number {
  let n = 0
  const d = new Date(Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate()) + DIA_MS)
  const fim = Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate())
  for (; d.getTime() <= fim; d.setTime(d.getTime() + DIA_MS)) {
    const semana = d.getUTCDay()
    if (semana !== 0 && semana !== 6) n++
  }
  return n
}

/**
 * Jobs de mercado sem execução boa há tempo demais: mais de 3 dias úteis, ou
 * 8 dias corridos no extrato, que é semanal. Pega o cron que nem rodou, coisa
 * que execucoes_mercado sozinha não mostra.
 */
export function jobsParados(ultimoOk: Partial<Record<Job, Date>>, agora: Date): Job[] {
  return JOBS.filter((job) => {
    const ultimo = ultimoOk[job]
    if (!ultimo) return true
    if (job === 'cvm_extrato') return (agora.getTime() - ultimo.getTime()) / DIA_MS > 8
    return diasUteisDepois(ultimo, agora) > 3
  })
}
