import {
  getOrgId,
  getRecurringTemplates,
  getUpcomingRecurring,
  getAccounts,
  getCategories,
  getDatasDasParcelas,
} from '@/lib/finance/queries'
import { contasParaLancamento } from '@/lib/finance/account-options'
import { RecurringTemplateList } from '@/components/finance/recurring-template-list'
import { PageHeader } from '@/components/ui/page-header'
import { LinkDeAjuda } from '@/components/ajuda/link-de-ajuda'

export default async function RecurringPage() {
  const orgId = await getOrgId()
  const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const [templates, upcoming, accounts, categories, datas] = await Promise.all([
    getRecurringTemplates(orgId),
    getUpcomingRecurring(orgId),
    getAccounts(orgId),
    getCategories(orgId),
    getDatasDasParcelas(orgId, hojeStr),
  ])

  const accountOptions = contasParaLancamento(accounts)
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transações Recorrentes"
        description="Gerencie os modelos de transações recorrentes e gere lançamentos automaticamente"
      >
        <LinkDeAjuda topico="recorrentes" />
      </PageHeader>
      <RecurringTemplateList
        templates={templates.map((t) => ({
          ...t,
          proximaParcela: datas.get(t.id)?.proxima ?? null,
          ultimaParcela: datas.get(t.id)?.ultima ?? null,
          nextDueDate: t.nextDueDate instanceof Date ? t.nextDueDate.toISOString() : t.nextDueDate,
          endDate: t.endDate instanceof Date ? t.endDate.toISOString() : t.endDate,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
          updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
        }))}
        upcoming={upcoming.map((t) => ({
          ...t,
          nextDueDate: t.nextDueDate instanceof Date ? t.nextDueDate.toISOString() : t.nextDueDate,
          endDate: t.endDate instanceof Date ? t.endDate.toISOString() : t.endDate,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
          updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
        }))}
        accounts={accountOptions}
        categories={categoryOptions}
      />
    </div>
  )
}
