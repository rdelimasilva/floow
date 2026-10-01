import Link from 'next/link'
import { getOrgId, getCategories, getAccounts } from '@/lib/finance/queries'
import { getConfirmedCounterparties } from '@/lib/openfinance/counterparty-queries'
import { toCategoryOptions } from '@/lib/finance/category-options'
import { RegrasConfirmadas } from '@/components/openfinance/regras-confirmadas'
import { PageHeader } from '@/components/ui/page-header'

interface Props { searchParams: Promise<{ regra?: string }> }

/**
 * O que o floow faz sozinho com cada favorecido, fora do modo foco (spec
 * 2026-10-01): corrigir aqui vale para os próximos lançamentos. `?regra=` —
 * do menu da linha e de links antigos — abre a regra direto em edição.
 */
export default async function RegrasPage({ searchParams }: Props) {
  const { regra } = await searchParams
  const orgId = await getOrgId()
  const [confirmed, categories, accounts] = await Promise.all([
    getConfirmedCounterparties(orgId),
    getCategories(orgId),
    getAccounts(orgId),
  ])
  const categoryOptions = toCategoryOptions(categories.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })))

  return (
    <div className="space-y-6">
      <PageHeader title="Regras" description="O que o floow faz sozinho com cada favorecido. Corrigir aqui vale para os próximos.">
        <Link href="/transactions/conciliar" className="text-sm text-gray-600 underline">Voltar para Conciliar</Link>
      </PageHeader>
      {confirmed.length === 0 ? (
        <p className="text-sm text-gray-600">Nenhuma regra confirmada ainda.</p>
      ) : (
        <RegrasConfirmadas
          confirmed={confirmed}
          categoryOptions={categoryOptions}
          accountOptions={accounts.map((a) => ({ id: a.id, name: a.name }))}
          regraAberta={regra}
        />
      )}
    </div>
  )
}
