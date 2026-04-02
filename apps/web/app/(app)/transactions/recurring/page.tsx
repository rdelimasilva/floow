import { getOrgId, getRecurringTemplates, getUpcomingRecurring, getAccounts, getCategories } from '@/lib/finance/queries'
import { RecurringTemplateList } from '@/components/finance/recurring-template-list'
import { PageHeader } from '@/components/ui/page-header'

export default async function RecurringPage() {
  const orgId = await getOrgId()
  const [templates, upcoming, accounts, categories] = await Promise.all([
    getRecurringTemplates(orgId),
    getUpcomingRecurring(orgId),
    getAccounts(orgId),
    getCategories(orgId),
  ])

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }))
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transacoes Recorrentes"
        description="Gerencie templates de transacoes recorrentes e gere lancamentos automaticamente"
      />
      <RecurringTemplateList
        templates={templates.map((t) => ({
          ...t,
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
