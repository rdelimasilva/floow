import { NextResponse } from 'next/server'
import { getServiceDb } from '@floow/db'
import { isAuthorizedService } from '@/lib/auth/service-auth'
import { executarJob } from '@/lib/mercado/execucao'
import { repoDrizzle } from '@/lib/mercado/repo'
import { rodarBcb } from '@/lib/mercado/jobs/bcb'

/**
 * Cron diário: CDI, Selic e IPCA do SGS do Banco Central para
 * indicadores_diarios. Falha não derruba a rota: fica em execucoes_mercado e
 * no Sentry.
 */
export async function POST(request: Request) {
  const autorizado = isAuthorizedService(request.headers.get('authorization'), [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.CRON_SECRET,
  ])
  if (!autorizado) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const repo = repoDrizzle(getServiceDb())
  const r = await executarJob('bcb', repo, () => rodarBcb({ fetch, repo, hoje: new Date() }))
  return NextResponse.json(r)
}

// O cron da Vercel dispara com GET; o POST fica para chamadas manuais.
export { POST as GET }
