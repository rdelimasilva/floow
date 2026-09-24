import { NextResponse } from 'next/server'
import { getVerifiedIdentity } from '@/lib/auth/session'
import { getOrgId } from '@/lib/finance/queries'
import { executarBackfillDeTransferencias } from '@/lib/openfinance/backfill'
import { recordAudit } from '@/lib/audit/record'

/**
 * POST /api/admin/backfill-counterparties
 *
 * Roda manualmente, contra a org do usuário autenticado. Sem agendamento, sem
 * chamada automática — decisão do operador.
 *
 * Não chama mais `backfillCounterparties`: aquele rebusca a Polp e reescreve
 * tipo, categoria e estado de todo o histórico, então rodá-lo de novo desfaria
 * o que o usuário já decidiu em Classificar. `executarBackfillDeTransferencias`
 * mexe só no recorte de transferência sem par e pode rodar mais de uma vez.
 */
export async function POST() {
  const identity = await getVerifiedIdentity()

  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await getOrgId()

  try {
    const contagens = await executarBackfillDeTransferencias(orgId)

    await recordAudit({
      action: 'admin.backfill_counterparties',
      resource: 'counterparties',
      metadata: contagens,
    })

    return NextResponse.json({ ok: true, ...contagens })
  } catch (err) {
    console.error('[backfill-counterparties] Failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Backfill failed' }, { status: 500 })
  }
}
