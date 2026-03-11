import Link from 'next/link'
import { getOrgId } from '@/lib/finance/queries'
import { getAccounts } from '@/lib/finance/queries'
import { AccountCard } from '@/components/finance/account-card'
import { formatBRL } from '@floow/core-finance'
import { Button } from '@/components/ui/button'

export default async function AccountsPage() {
  const orgId = await getOrgId()
  const accounts = await getAccounts(orgId)

  const totalBalanceCents = accounts.reduce((sum, a) => sum + a.balanceCents, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Contas</h1>
          {accounts.length > 0 && (
            <p className="mt-1 text-sm text-gray-500">
              Patrimônio total:{' '}
              <span
                className={`font-semibold ${
                  totalBalanceCents >= 0 ? 'text-green-700' : 'text-red-600'
                }`}
              >
                {formatBRL(totalBalanceCents)}
              </span>
            </p>
          )}
        </div>
        <Button asChild>
          <Link href="/accounts/new">Nova Conta</Link>
        </Button>
      </div>

      {/* Account grid */}
      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <p className="text-gray-500">Nenhuma conta encontrada.</p>
          <p className="mt-1 text-sm text-gray-400">
            Crie sua primeira conta para começar.
          </p>
          <Button asChild className="mt-4">
            <Link href="/accounts/new">Criar Conta</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  )
}
