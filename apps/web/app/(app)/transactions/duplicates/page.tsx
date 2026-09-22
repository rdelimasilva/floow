import { getOrgId } from '@/lib/finance/queries'
import { getDuplicatasPendentes } from '@/lib/finance/duplicata-queries'
import { DuplicateProposalQueue } from '@/components/finance/duplicate-proposal-queue'
import { PageHeader } from '@/components/ui/page-header'

export default async function DuplicatesPage() {
  const orgId = await getOrgId()
  const propostas = await getDuplicatasPendentes(orgId)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Possíveis duplicatas"
        description="Lançamentos que o banco mandou duas vezes, com ids diferentes. Nada sai das somas sem você aprovar."
      />
      <DuplicateProposalQueue propostas={propostas} />
    </div>
  )
}
