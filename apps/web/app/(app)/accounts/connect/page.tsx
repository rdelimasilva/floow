import Link from 'next/link'
import { getOrgId } from '@/lib/finance/queries'
import { getPolpClient, isPolpConfigured } from '@/lib/openfinance/config'
import { getBankConnections } from '@/lib/openfinance/queries'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { ConnectWizard } from './connect-wizard'
import { ConnectionList } from './connection-list'

export default async function ConnectBankPage() {
  const orgId = await getOrgId()

  if (!isPolpConfigured()) {
    return (
      <div className="space-y-6">
        <PageHeader title="Conectar banco" />
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-gray-700">A integração com Open Finance ainda não está configurada.</p>
          <p className="mt-2 text-sm text-gray-500">
            Faltam as credenciais da Polp no ambiente: <code>POLP_API_CLIENT</code>,{' '}
            <code>POLP_API_SECRET</code> e <code>POLP_CPF_SALT</code>.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/accounts">Voltar para Contas</Link>
          </Button>
        </div>
      </div>
    )
  }

  const connections = await getBankConnections(orgId)

  // A lista de instituições é pública e muda pouco; uma falha aqui não deve
  // impedir o usuário de ver e gerenciar as conexões que ele já tem.
  let institutions: { id: string; name: string; logoUrl: string | null; type: string }[] = []
  let institutionsError: string | null = null

  try {
    const all = await getPolpClient().listInstitutions()
    institutions = all
      // OPERATIONAL porque o POST /consents exige; e só instituições que
      // aceitam conexão de pessoa física, porque o wizard pede apenas CPF.
      // Das 211 que a Polp lista, 22 são BUSINESS e exigem CNPJ: oferecê-las
      // aqui seria deixar o usuário escolher um banco que vai recusar o
      // consentimento depois de ele já ter digitado o CPF.
      .filter((i) => i.status === 'OPERATIONAL' && (i.type === 'PERSONAL' || i.type === 'BOTH'))
      .map((i) => ({ id: i.id, name: i.name, logoUrl: i.logo_url, type: i.type }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  } catch {
    institutionsError = 'Não foi possível carregar a lista de bancos agora.'
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Conectar banco"
        description="Traga extrato e fatura automaticamente pelo Open Finance."
      >
        <Button asChild variant="outline">
          <Link href="/accounts">Voltar</Link>
        </Button>
      </PageHeader>

      <ConnectWizard institutions={institutions} loadError={institutionsError} />

      {connections.length > 0 && <ConnectionList connections={connections} />}
    </div>
  )
}
