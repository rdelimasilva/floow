import { NextResponse } from 'next/server'
import { getMonthlyCashFlowSummary, getFutureMonthlyCashFlowSummary } from '@/lib/finance/queries'
import { getVerifiedIdentity, getOrgId } from '@/lib/auth/session'
import { recordAudit } from '@/lib/audit/record'
import { planilhaDeFluxoDeCaixa, TIPO_XLSX } from '@/lib/export/planilha'

/** Fluxo de caixa mês a mês em XLSX: os mesmos 24 meses, realizados e previstos, da tela. */
export async function GET() {
  const identity = await getVerifiedIdentity()
  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const orgId = await getOrgId()
    const [realizado, previsto] = await Promise.all([
      getMonthlyCashFlowSummary(orgId, 24),
      getFutureMonthlyCashFlowSummary(orgId, 24),
    ])

    await recordAudit({
      action: 'cash_flow.export',
      resource: 'transactions',
      resourceCount: realizado.length + previsto.length,
      metadata: { formato: 'xlsx' },
    })

    const planilha = await planilhaDeFluxoDeCaixa(realizado, previsto)
    return new NextResponse(new Uint8Array(planilha), {
      headers: {
        'Content-Type': TIPO_XLSX,
        'Content-Disposition': `attachment; filename="fluxo-de-caixa.xlsx"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Erro ao exportar' }, { status: 500 })
  }
}
