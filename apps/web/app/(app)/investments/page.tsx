import Link from 'next/link'
import { getOrgId } from '@/lib/finance/queries'
import { getPositions } from '@/lib/investments/queries'
import { PositionTable } from '@/components/investments/position-table'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

export default async function InvestmentsPage() {
  const orgId = await getOrgId()
  const positions = await getPositions(orgId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Investimentos"
        description="Acompanhe sua carteira de investimentos e evolução patrimonial"
      >
        <Button asChild variant="outline">
          <Link href="/investments/new">Novo Ativo</Link>
        </Button>
        <Button asChild variant="primary">
          <Link href="/investments/new">Registrar Evento</Link>
        </Button>
      </PageHeader>

      {/* Position table or empty state */}
      {positions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
          <h3 className="text-sm font-medium text-gray-900">Nenhum ativo cadastrado</h3>
          <p className="mt-1 text-sm text-gray-500">
            Comece registrando seus ativos e eventos de portfolio.
          </p>
          <div className="mt-6">
            <Button asChild variant="primary">
              <Link href="/investments/new">Cadastrar Ativo</Link>
            </Button>
          </div>
        </div>
      ) : (
        <PositionTable positions={positions} orgId={orgId} />
      )}
    </div>
  )
}
