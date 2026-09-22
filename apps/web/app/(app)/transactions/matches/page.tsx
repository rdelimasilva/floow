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
        title="Confirmar previsões"
        description="Previsões suas que parecem já ter acontecido, com o lançamento do banco que as cumpriu. Nada é confirmado sem você aprovar."
      />
      <MatchProposalQueue propostas={propostas} />
    </div>
  )
}
