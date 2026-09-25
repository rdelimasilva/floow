import { getOrgId } from '@/lib/finance/queries'
import { getDuplicatasPendentes } from '@/lib/finance/duplicata-queries'
import { DuplicateProposalQueue } from '@/components/finance/duplicate-proposal-queue'
import { PageHeader } from '@/components/ui/page-header'
import { LinkDeAjuda } from '@/components/ajuda/link-de-ajuda'

export default async function DuplicatesPage() {
  const orgId = await getOrgId()
  const propostas = await getDuplicatasPendentes(orgId)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Remover repetidos"
        description="Lançamentos que o banco mandou duas vezes. Nada sai das somas sem você aprovar."
      >
        <LinkDeAjuda topico="filas" />
      </PageHeader>
      <DuplicateProposalQueue propostas={propostas} />
    </div>
  )
}
