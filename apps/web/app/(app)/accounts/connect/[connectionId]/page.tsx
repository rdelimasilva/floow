import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getOrgId, getAccounts } from '@/lib/finance/queries'
import { getBankConnection } from '@/lib/openfinance/queries'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { LinkResources } from './link-resources'

interface Props {
  params: Promise<{ connectionId: string }>
}

/**
 * Tela de retorno da autorização no banco (D5).
 *
 * O usuário chega aqui vindo do banco, e o que ele precisa decidir é uma coisa
 * só: para cada conta que o banco liberou, vincular a uma conta que já existe
 * no floow ou criar uma nova.
 */
export default async function ConnectionDetailPage({ params }: Props) {
  const { connectionId } = await params
  const orgId = await getOrgId()

  const [connection, accounts] = await Promise.all([
    getBankConnection(orgId, connectionId),
    getAccounts(orgId),
  ])

  if (!connection) notFound()

  return (
    <div className="space-y-6">
      <PageHeader
        title={connection.institutionName ?? 'Conexão'}
        description={`CPF ${connection.cpfMasked}`}
      >
        <Button asChild variant="outline">
          <Link href="/accounts/connect">Voltar</Link>
        </Button>
      </PageHeader>

      <LinkResources
        connectionId={connection.id}
        status={connection.status}
        resources={connection.resources}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
      />
    </div>
  )
}
