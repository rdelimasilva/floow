import { NextResponse } from 'next/server'
import { getDb } from '@floow/db'
import { getVerifiedIdentity } from '@/lib/auth/session'
import { getOrgId } from '@/lib/finance/queries'
import { devolverTransferenciasSemParAClassificar } from '@/lib/openfinance/transferencias-sem-par'
import { criarPernasPrevistasFaltantes } from '@/lib/openfinance/pernas-faltantes'
import { recordAudit } from '@/lib/audit/record'

/**
 * POST /api/admin/backfill-counterparties
 *
 * Roda manualmente, contra a org do usuário autenticado. Sem agendamento, sem
 * chamada automática — decisão do operador.
 *
 * Não chama mais `backfillCounterparties`: aquele rebusca a Polp e reescreve
 * tipo, categoria e estado de todo o histórico, então rodá-lo de novo desfaria
 * o que o usuário já decidiu em Classificar. As duas rotinas daqui mexem só no
 * recorte de transferência sem par e podem rodar mais de uma vez:
 * 1. transferência do banco sem conta volta pendente, com contraparte;
 * 2. transferência com destino Open Finance sem perna ganha a perna prevista.
 */
export async function POST() {
  const identity = await getVerifiedIdentity()

  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await getOrgId()

  try {
    const db = getDb()
    const devolvidas = await devolverTransferenciasSemParAClassificar(db, orgId)
    const pernas = await criarPernasPrevistasFaltantes(db, orgId)

    const contagens = {
      transferenciasDevolvidas: devolvidas.devolvidas,
      transferenciasSemChave: devolvidas.semChave,
      pernasPrevistas: pernas.criadas,
    }

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
