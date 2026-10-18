import Link from 'next/link'
import { formatBRL } from '@floow/core-finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Account } from '@floow/db'
import { valorDaConta } from '@/lib/finance/patrimonio'

interface AccountSummaryRowProps {
  accounts: Account[]
  /** Valor das posições das contas de investimento do Open Finance (ver `valorDaConta`). */
  valorDasPosicoes?: Map<string, number>
}

export function AccountSummaryRow({ accounts, valorDasPosicoes = new Map() }: AccountSummaryRowProps) {
  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-muted-foreground mb-4">
            Você ainda não tem contas cadastradas.
          </p>
          <Button variant="primary" asChild>
            <Link href="/accounts/new">Criar primeira conta</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Contas</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/accounts" className="text-xs text-muted-foreground">
              Ver todas
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {accounts.map((account) => {
            const valorCents = valorDaConta(account, valorDasPosicoes)
            return (
              <div key={account.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{account.name}</span>
                <span className={`font-medium ${valorCents < 0 ? 'text-red-600' : 'text-foreground'}`}>
                  {formatBRL(valorCents)}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
