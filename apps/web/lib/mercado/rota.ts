import { NextResponse } from 'next/server'
import { getServiceDb } from '@floow/db'
import { isAuthorizedService } from '@/lib/auth/service-auth'
import { executarJob, type ResultadoDoCorpo } from './execucao'
import { repoDrizzle, type Job, type RepoMercado } from './repo'

type Contexto = { repo: RepoMercado; db: ReturnType<typeof getServiceDb>; hoje: Date }

/**
 * Handler das rotas /api/cron/mercado-*: autentica pelo segredo do cron e
 * roda o job. Falha do job não vira 500; fica em execucoes_mercado e no Sentry.
 */
export function rotaDeMercado(job: Job, corpo: (ctx: Contexto) => Promise<ResultadoDoCorpo>) {
  return async function POST(request: Request) {
    const autorizado = isAuthorizedService(request.headers.get('authorization'), [
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.CRON_SECRET,
    ])
    if (!autorizado) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = getServiceDb()
    const repo = repoDrizzle(db)
    const r = await executarJob(job, repo, () => corpo({ repo, db, hoje: new Date() }))
    return NextResponse.json(r)
  }
}
