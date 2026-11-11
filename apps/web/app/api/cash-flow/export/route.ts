import { NextResponse } from 'next/server'
import { getRecentTransactions, getFutureTransactions } from '@/lib/finance/queries'
import { getVerifiedIdentity, getOrgId } from '@/lib/auth/session'
import { recordAudit } from '@/lib/audit/record'
import { planilhaDeFluxoDeCaixa, TIPO_XLSX } from '@/lib/export/planilha'
import { recorteDaUrl } from '@/lib/finance/recorte'
import { resumoMensalDeLancamentos } from '@/lib/finance/resumo-mensal-de-lancamentos'

/**
 * Fluxo de caixa mês a mês em XLSX, no recorte da tela (`startDate`, `endDate`,
 * `accountId`); sem recorte na URL, tudo. Sai dos mesmos lançamentos da tela.
 */
export async function GET(request: Request) {
  const identity = await getVerifiedIdentity()
  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const orgId = await getOrgId()
    const { startDate, endDate, accountIds } = recorteDaUrl(
      Object.fromEntries(new URL(request.url).searchParams),
    )
    const periodo = { inicio: startDate || undefined, fim: endDate || undefined }
    const [recentes, futuros] = await Promise.all([
      getRecentTransactions(orgId, periodo),
      getFutureTransactions(orgId),
    ])
    const filtro = { ...periodo, contas: accountIds }
    const realizado = resumoMensalDeLancamentos(recentes, filtro)
    const previsto = resumoMensalDeLancamentos(futuros, filtro)

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
