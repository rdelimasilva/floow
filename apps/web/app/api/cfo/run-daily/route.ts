import { NextResponse } from 'next/server'
import { getDb, transactions } from '@floow/db'
import { gte } from 'drizzle-orm'
import { runCfoEngine } from '@/lib/cfo/engine'

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isServiceRole = authHeader === `Bearer ${SERVICE_ROLE_KEY}`
  const isCron = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`
  if (!isServiceRole && !isCron) {
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
    }

    return NextResponse.json({ ok: true, orgs: activeOrgs.length, insights: totalInsights })
  } catch (err) {
    console.error('[CFO] Daily run failed:', err)
    return NextResponse.json({ error: 'Daily run failed' }, { status: 500 })
  }
}
