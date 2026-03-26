import { NextResponse } from 'next/server'
import { runCfoEngine } from '@/lib/cfo/engine'
import type { InsightCategory } from '@floow/core-finance'

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { orgId, event, analyzers } = (await request.json()) as {
      orgId: string
      event: string
      analyzers: InsightCategory[]
    }

    const result = await runCfoEngine(orgId, {
      triggerEvent: event,
      categories: analyzers,
    })

    return NextResponse.json({ ok: true, insights: result.insightsGenerated })
  } catch (err) {
    console.error('[CFO] Event run failed:', err)
    return NextResponse.json({ error: 'Event run failed' }, { status: 500 })
  }
}
