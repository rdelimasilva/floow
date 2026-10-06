import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getOrgId, getCategories, getAccounts } from '@/lib/finance/queries'
import { carregarFila } from '@/lib/finance/conciliacao/fila-db'
import { toCategoryOptions } from '@/lib/finance/category-options'
import { FilaFoco } from '@/components/finance/conciliar/fila-foco'
import { TudoConciliado } from '@/components/finance/conciliar/tudo-conciliado'
import { PageHeader } from '@/components/ui/page-header'
import { LinkDeAjuda } from '@/components/ajuda/link-de-ajuda'

interface Props { searchParams: Promise<{ regra?: string }> }

/**
 * Um lançamento do banco por vez, com tudo que se decide sobre ele (spec
 * 2026-10-01). Nada aqui tranca o app; quem traz até aqui é a faixa e o botão
 * de Transações, o selo da linha e o assistente de conexão.
 */
export default async function ConciliarPage({ searchParams }: Props) {
  const { regra } = await searchParams
  if (regra) redirect(`/transactions/conciliar/regras?regra=${encodeURIComponent(regra)}`)

  const orgId = await getOrgId()
  const [{ itens, total }, categories, accounts] = await Promise.all([carregarFila(orgId), getCategories(orgId), getAccounts(orgId)])
  const categoryOptions = toCategoryOptions(categories.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })))

  return (
    <div className="space-y-6">
      <PageHeader title="Conciliar" description="Um lançamento do banco por vez. Nada muda sem você aprovar.">
        <Link href="/transactions/conciliar/regras" className="text-sm text-gray-600 underline">Regras</Link>
        <LinkDeAjuda topico="filas" />
      </PageHeader>
      {total === 0 ? (
        <TudoConciliado />
      ) : (
        <FilaFoco itens={itens} total={total} categoryOptions={categoryOptions} accountOptions={accounts.map((a) => ({ id: a.id, name: a.name }))} />
      )}
    </div>
  )
}
