import { NextResponse } from 'next/server'
import { getDb } from '@floow/db'
import { getVerifiedIdentity } from '@/lib/auth/session'
import { getOrgId } from '@/lib/finance/queries'
import { backfillCounterparties } from '@/lib/openfinance/backfill'
import { criarPernasPrevistasFaltantes } from '@/lib/openfinance/pernas-faltantes'
import { recordAudit } from '@/lib/audit/record'

/**
 * POST /api/admin/backfill-counterparties
 *
 * Roda UMA vez, manualmente, contra a org do usuário autenticado. Sem
 * agendamento, sem chamada automática — decisão do operador, feita uma vez.
 */
export async function POST() {
  const identity = await getVerifiedIdentity()

  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await getOrgId()

  try {
    const result = await backfillCounterparties(orgId)
    const pernas = await criarPernasPrevistasFaltantes(getDb(), orgId)

    await recordAudit({
      action: 'admin.backfill_counterparties',
      resource: 'counterparties',
      metadata: { ...result, pernasPrevistas: pernas.criadas },
    })

    return NextResponse.json({ ok: true, ...result, pernasPrevistas: pernas.criadas })
  } catch (err) {
    console.error('[backfill-counterparties] Failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Backfill failed' }, { status: 500 })
  }
}
