import { getOrgId } from '@/lib/finance/queries'
import { getPropostasPendentes } from '@/lib/finance/forecast-match-queries'
import { MatchProposalQueue } from '@/components/finance/match-proposal-queue'
import { PageHeader } from '@/components/ui/page-header'

export default async function MatchesPage() {
  const orgId = await getOrgId()
  const propostas = await getPropostasPendentes(orgId)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Conciliações"
        description="Pares que o floow encontrou entre a previsão e o que o banco trouxe. Nada é conciliado sem você aprovar."
      />
      <MatchProposalQueue propostas={propostas} />
    </div>
  )
}
