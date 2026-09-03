import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getOrgId, getAccounts } from '@/lib/finance/queries'
import { getBankConnection, getLastTransactionDateByAccount } from '@/lib/openfinance/queries'
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

  const [connection, accounts, lastDates] = await Promise.all([
    getBankConnection(orgId, connectionId),
    getAccounts(orgId),
    // Para sugerir de quando começar a importar: o dia seguinte à última
    // transação que a conta já tem é o corte que não duplica nada.
    getLastTransactionDateByAccount(orgId),
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
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          lastTransactionDate: lastDates[a.id] ?? null,
        }))}
      />
    </div>
  )
}
