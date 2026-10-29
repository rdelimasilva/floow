import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { getGastosDosCartoes } from '@/lib/finance/queries-gastos-cartao'
import { GastosDosCartoes } from '@/components/finance/gastos-dos-cartoes'
import { PageHeader } from '@/components/ui/page-header'

async function Conteudo({ orgId }: { orgId: string }) {
  const cartoes = await getGastosDosCartoes(orgId)
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return <GastosDosCartoes cartoes={cartoes} hoje={hoje} />
}

export default async function GastosDosCartoesPage() {
  const orgId = await getOrgId()
  return (
    <div className="space-y-6">
      <PageHeader title="Gastos dos cartões" description="Quanto você gastou em cada fatura, mês a mês" />
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-gray-100" />}>
        <Conteudo orgId={orgId} />
      </Suspense>
    </div>
  )
}
