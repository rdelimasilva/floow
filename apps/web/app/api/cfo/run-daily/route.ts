import { NextResponse } from 'next/server'
import { getDb, transactions } from '@floow/db'
import { gte, sql } from 'drizzle-orm'
import { runCfoEngine } from '@/lib/cfo/engine'
import { isAuthorizedService } from '@/lib/auth/service-auth'
import { runPacingAlertsForOrg } from '@/lib/notifications/pacing-alerts-job'
import { defaultPacingAlertsDeps } from '@/lib/notifications/pacing-alerts-deps'

export async function POST(request: Request) {
  const authorized = isAuthorizedService(request.headers.get('authorization'), [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.CRON_SECRET,
  ])
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = getDb()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const activeOrgs = await db
      .selectDistinct({ orgId: transactions.orgId })
      .from(transactions)
      .where(gte(transactions.date, thirtyDaysAgo))

    let totalInsights = 0
    let emailsSent = 0
    let whatsappSent = 0
    const alertDeps = defaultPacingAlertsDeps()
    const batchSize = 10

    for (let i = 0; i < activeOrgs.length; i += batchSize) {
      const batch = activeOrgs.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map((row) =>
          runCfoEngine(row.orgId)
            .then((r) => r.insightsGenerated)
            .catch((err) => {
              console.error(`[CFO] Daily run failed for org=${row.orgId}:`, err)
              return 0
            })
        )
      )
      totalInsights += results.reduce((s, n) => s + n, 0)

      // Ritmo roda depois do engine e isolado dele: falha de envio não pode
      // apagar os insights do dia, nem o contrário.
      const sent = await Promise.all(
        batch.map((row) =>
          runPacingAlertsForOrg(row.orgId, alertDeps)
            .then((r) => r.sent)
            .catch((err) => {
              console.error(`[ritmo] falhou para org=${row.orgId}:`, err)
              return { email: 0, whatsapp: 0 }
            })
        )
      )
      emailsSent += sent.reduce((s, n) => s + n.email, 0)
      whatsappSent += sent.reduce((s, n) => s + n.whatsapp, 0)
    }

    // Janelas vencidas nao servem mais para decidir nada; sem isto a tabela so
    // cresce. Duas casas de folga para nao tocar em janela ainda em uso.
    await db.execute(
      sql`delete from public.rate_limits where window_start < now() - interval '2 days'`,
    )

    return NextResponse.json({ ok: true, orgs: activeOrgs.length, insights: totalInsights, emailsSent, whatsappSent })
  } catch (err) {
    console.error('[CFO] Daily run failed:', err)
    return NextResponse.json({ error: 'Daily run failed' }, { status: 500 })
  }
}

// O cron da Vercel dispara com GET; o POST fica para chamadas manuais.
export { POST as GET }
