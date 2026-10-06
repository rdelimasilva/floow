import Link from 'next/link'
import { getOrgId } from '@/lib/finance/queries'
import { getEstadoDoCadastro } from '@/lib/onboarding/estado-do-cadastro'
import { PageHeader } from '@/components/ui/page-header'
import { GuiaPrimeirosPassos } from '@/components/onboarding/guia-primeiros-passos'

/**
 * Passo a passo de cadastro das contas. Não é item de menu: chega-se pelo
 * card do dashboard e pela tela de Contas vazia.
 */
export default async function PrimeirosPassosPage() {
  const orgId = await getOrgId()
  const estado = await getEstadoDoCadastro(orgId)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/accounts" className="text-sm text-gray-500 hover:text-gray-700">
        &larr; Contas
      </Link>
      <PageHeader
        title="Primeiros passos"
        description="Cadastre suas contas em poucos minutos. Cada passo explica o que preencher; os opcionais podem ser pulados."
      />
      <GuiaPrimeirosPassos estado={estado} />
    </div>
  )
}
