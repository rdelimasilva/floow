import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { CounterpartyQueue } from '@/components/openfinance/counterparty-queue'
import { PageHeader } from '@/components/ui/page-header'
import { LinkDeAjuda } from '@/components/ajuda/link-de-ajuda'

interface Props {
  searchParams: Promise<{ regra?: string }>
}

export default async function ReviewPage({ searchParams }: Props) {
  const orgId = await getOrgId()
  const { regra } = await searchParams

  return (
    <div className="space-y-4">
      <PageHeader
        title="Classificar lançamentos"
        description="Lançamentos que vieram do banco e o floow ainda não sabe classificar sozinho. Você decide uma vez e vale para os próximos."
      >
        <LinkDeAjuda topico="filas" />
      </PageHeader>
      <Suspense fallback={null}>
        <CounterpartyQueue orgId={orgId} mode="page" regraAberta={regra} />
      </Suspense>
    </div>
  )
}
