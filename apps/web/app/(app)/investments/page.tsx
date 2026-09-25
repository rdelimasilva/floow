import Link from 'next/link'
import { getOrgId } from '@/lib/finance/queries'
import { getPositions } from '@/lib/investments/queries'
import { getContasDosAtivos } from '@/lib/investments/contas-dos-ativos'
import { PositionTable } from '@/components/investments/position-table'
import { FiltroDeContaDaCarteira } from '@/components/investments/filtro-de-conta-da-carteira'
import { MostrarEncerrados } from '@/components/investments/mostrar-encerrados'
import { estaEncerrada } from '@/lib/investments/encerrados'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

interface InvestmentsPageProps {
  searchParams: Promise<{ accountId?: string; encerrados?: string }>
}

export default async function InvestmentsPage({ searchParams }: InvestmentsPageProps) {
  const orgId = await getOrgId()
  const [todas, { contas, porAtivo }, sp] = await Promise.all([
    getPositions(orgId),
    getContasDosAtivos(orgId),
    searchParams,
  ])

  // Marcada que não guarda mais ativo nenhum não filtra — senão a carteira
  // some sem que o filtro mostre por quê.
  const marcadas = new Set((sp.accountId ?? '').split(',').filter((id) => contas.some((c) => c.id === id)))
  const daConta = marcadas.size === 0
    ? todas
    : todas.filter((p) => [...(porAtivo.get(p.assetId) ?? [])].some((id) => marcadas.has(id)))
  const verEncerrados = sp.encerrados === '1'
  const encerrados = daConta.filter(estaEncerrada).length
  const positions = verEncerrados ? daConta : daConta.filter((p) => !estaEncerrada(p))

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Investimentos"
        description="Acompanhe sua carteira de investimentos e evolução patrimonial"
      >
        <Button asChild variant="primary">
          <Link href="/investments/new">Novo Ativo / Evento</Link>
        </Button>
      </PageHeader>

      {(contas.length > 1 || encerrados > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {contas.length > 1 && <FiltroDeContaDaCarteira contas={contas} />}
          {encerrados > 0 && <MostrarEncerrados quantidade={encerrados} ativo={verEncerrados} />}
        </div>
      )}

      {/* Position table or empty state */}
      {daConta.length > 0 && positions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center text-sm text-gray-500">
          Nenhum ativo com saldo{marcadas.size > 0 ? ' nas contas selecionadas' : ''}.
        </div>
      ) : marcadas.size > 0 && positions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center text-sm text-gray-500">
          Nenhum ativo nas contas selecionadas.
        </div>
      ) : positions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
          <h3 className="text-sm font-medium text-gray-900">Nenhum ativo cadastrado</h3>
          <p className="mt-1 text-sm text-gray-500">
            Comece registrando seus ativos e eventos de portfolio.
          </p>
          <div className="mt-6">
            <Button asChild variant="primary">
              <Link href="/investments/new">Novo Ativo</Link>
            </Button>
          </div>
        </div>
      ) : (
        <PositionTable positions={positions} orgId={orgId} />
      )}
    </div>
  )
}
