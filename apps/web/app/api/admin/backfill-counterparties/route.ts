import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/finance/queries'
import { backfillCounterparties } from '@/lib/openfinance/backfill'

/**
 * POST /api/admin/backfill-counterparties
 *
 * Roda UMA vez, manualmente, contra a org do usuário autenticado. Sem
 * agendamento, sem chamada automática — decisão do operador, feita uma vez.
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await getOrgId()

  try {
    const result = await backfillCounterparties(orgId)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[backfill-counterparties] Failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Backfill failed' }, { status: 500 })
  }
}
