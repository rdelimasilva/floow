import { getOrgId } from '@/lib/finance/queries'
import { getCategories } from '@/lib/finance/queries-categories'
import { getAllBudgetEntries } from '@/lib/finance/budget-queries'
import { ListaDeMetas } from './lista-de-metas'

// O cache devolve a data como Date ou como string, conforme veio do banco ou do cache.
const mesIso = (d: Date | string | null) => (d == null ? null : (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10))

export default async function MetasPage() {
  const orgId = await getOrgId()
  const mes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7) + '-01'
  const [categorias, entradas] = await Promise.all([getCategories(orgId), getAllBudgetEntries(orgId, 'spending')])

  // Só a meta que vale neste mês; as de meses passados ficam como estão.
  const ativas = entradas
    .map((e) => ({ id: e.id, categoryId: e.categoryId, plannedCents: e.plannedCents, startMonth: mesIso(e.startMonth)!, endMonth: mesIso(e.endMonth) }))
    .filter((e) => e.startMonth <= mes && (e.endMonth == null || e.endMonth >= mes))

  const linhas = categorias
    .filter((c) => c.type === 'expense' && !c.parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((c) => ({ categoryId: c.id, nome: c.name, meta: ativas.find((e) => e.categoryId === c.id) ?? null }))

  return <ListaDeMetas linhas={linhas} mes={mes} />
}
