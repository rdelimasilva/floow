import * as Sentry from '@sentry/nextjs'
import type { Job, RepoMercado } from './repo'

export type ResultadoDoCorpo = { linhas: number; invalidas: number; total: number }

/** Acima disso, o arquivo provavelmente mudou de formato e o job conta como falha. */
const MAX_INVALIDAS = 0.05

/**
 * Roda o corpo de um job e registra em execucoes_mercado. Nunca lança: falha
 * vira ok=false e aviso no Sentry, e o que já estava gravado continua lá.
 */
export async function executarJob(
  job: Job,
  repo: RepoMercado,
  corpo: () => Promise<ResultadoDoCorpo>,
): Promise<{ ok: boolean; linhas: number }> {
  const inicio = new Date()
  let linhas = 0
  let erro: string | null = null
  try {
    const r = await corpo()
    linhas = r.linhas
    if (r.total > 0 && r.invalidas / r.total > MAX_INVALIDAS) {
      erro = `${r.invalidas} de ${r.total} linhas inválidas`
    }
  } catch (e) {
    erro = (e instanceof Error ? e.message : String(e)).slice(0, 500)
  }
  const ok = erro === null
  if (!ok) {
    Sentry.captureMessage(`mercado: job ${job} falhou`, { level: 'warning', tags: { mercado: job }, extra: { erro, linhas } })
  }
  try {
    await repo.registrarExecucao({ job, inicio, fim: new Date(), ok, linhas, erro })
  } catch (e) {
    console.error(`[mercado] não registrou a execução de ${job}:`, e)
  }
  return { ok, linhas }
}
