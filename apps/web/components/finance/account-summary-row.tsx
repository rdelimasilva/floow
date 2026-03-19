import Link from 'next/link'
import { formatBRL } from '@floow/core-finance'
import { AccountCard } from './account-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Account } from '@floow/db'

interface AccountSummaryRowProps {
  accounts: Account[]
}

/**
 * AccountSummaryRow — displays a horizontal row of account cards.
 *
 * Shows a card per account with name, type icon, and formatted balance.
 * Also shows a total balance card. If no accounts exist, shows an empty
 * state CTA linking to /accounts/new.
 */
export function AccountSummaryRow({ accounts }: AccountSummaryRowProps) {
  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-gray-500 mb-4">
            Voce ainda nao tem contas cadastradas.
          </p>
          <Button asChild variant="primary">
            <Link href="/accounts/new">Criar primeira conta</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const totalCents = accounts.reduce((sum, a) => sum + a.balanceCents, 0)

  return (
    <div className="space-y-3">
      {/* Total balance overview card */}
      <Card className="bg-gray-50 border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500 font-medium">Saldo Total</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold ${totalCents < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {formatBRL(totalCents)}
          </p>
          <p className="text-xs text-gray-400 mt-1">em {accounts.length} conta{accounts.length !== 1 ? 's' : ''}</p>
        </CardContent>
      </Card>

      {/* Per-account cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>
    </div>
  )
}
