import { getPendingCounterpartyGroups, getConfirmedCounterparties } from '@/lib/openfinance/counterparty-queries'
import { getCategories, getAccounts } from '@/lib/finance/queries'
import { toCategoryOptions } from '@/lib/finance/category-options'
import { CounterpartyQueueClient } from './counterparty-queue-client'

/**
 * Server component: busca os dados. `counterparty-queue-client.tsx` é quem
 * tem estado (confirmar, expandir) — dividido porque `confirmCounterparty` é
 * uma server action chamada de um formulário client-side.
 */
export async function CounterpartyQueue({ orgId, mode }: { orgId: string; mode: 'blocking' | 'page' }) {
  const [pending, confirmed, categories, accounts] = await Promise.all([
    getPendingCounterpartyGroups(orgId),
    mode === 'page' ? getConfirmedCounterparties(orgId) : Promise.resolve([]),
    getCategories(orgId),
    getAccounts(orgId),
  ])

  const categoryOptions = toCategoryOptions(
    categories.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })),
  )
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }))

  return (
    <CounterpartyQueueClient
      mode={mode}
      pending={pending}
      confirmed={confirmed}
      categoryOptions={categoryOptions}
      accountOptions={accountOptions}
    />
  )
}
