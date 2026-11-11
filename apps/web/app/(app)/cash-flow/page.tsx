import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getOrgId, getAccounts } from '@/lib/finance/queries'
import { CashFlowContent } from '@/components/finance/cash-flow-content'
import { PageHeader } from '@/components/ui/page-header'
import { BotaoDeExportar } from '@/components/finance/export-csv-button'
import { RECORTE_PADRAO, destinoComRecorte, lerRecorte, recorteDaUrl, temRecorteNaUrl } from '@/lib/finance/recorte'
import { destinoSoComContasValidas } from '@/lib/finance/url-do-menu'

function SectionSkeleton() {
  return <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
}

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function CashFlowPage({ searchParams }: Props) {
  const params = await searchParams
  const orgId = await getOrgId()

  // A URL é a fonte do recorte; sem ele nela, abre no último usado ("Este mês" na primeira visita).
  if (!temRecorteNaUrl(params)) {
    const jar = await cookies()
    const lidos = Object.fromEntries(jar.getAll().map((c) => [c.name, c.value]))
    const destino = destinoComRecorte('/cash-flow', params, lerRecorte(lidos) ?? RECORTE_PADRAO(), 'intervalo', { contas: true })
    if (destino) redirect(destino)
  }

  // Link velho com conta excluída: sai da URL, o cookie não é tocado.
  if (params.accountId) {
    const destino = destinoSoComContasValidas(params, (await getAccounts(orgId)).map((a) => a.id), '/cash-flow')
    if (destino) redirect(destino)
  }

  // Chave ausente é aberta ("Todo o período", todas as contas).
  const { startDate = '', endDate = '', accountIds = [] } = recorteDaUrl(params)
  const recorte = new URLSearchParams()
  if (startDate) recorte.set('startDate', startDate)
  if (endDate) recorte.set('endDate', endDate)
  if (accountIds.length) recorte.set('accountId', accountIds.join(','))
  const exportar = `/api/cash-flow/export${recorte.size ? `?${recorte}` : ''}`

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fluxo de Caixa"
        description="Receitas, despesas e saldo por período"
      >
        <div className="hidden sm:contents">
          <BotaoDeExportar
            url={exportar}
            arquivo="fluxo-de-caixa.xlsx"
            rotulo="Exportar Excel"
            erro="Não foi possível exportar o fluxo de caixa. Tente de novo."
          />
        </div>
      </PageHeader>

      <Suspense fallback={<><SectionSkeleton /><SectionSkeleton /><SectionSkeleton /></>}>
        <CashFlowContent orgId={orgId} startDate={startDate} endDate={endDate} accountIds={accountIds} />
      </Suspense>
    </div>
  )
}
