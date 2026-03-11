'use client'

import { Banknote, PiggyBank, TrendingUp, CreditCard, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatBRL } from '@floow/core-finance'
import type { Account } from '@floow/db'

const ACCOUNT_TYPE_CONFIG = {
  checking: { label: 'Conta Corrente', Icon: Banknote },
  savings: { label: 'Poupança', Icon: PiggyBank },
  brokerage: { label: 'Corretora', Icon: TrendingUp },
  credit_card: { label: 'Cartão de Crédito', Icon: CreditCard },
  cash: { label: 'Dinheiro', Icon: Wallet },
} as const

interface AccountCardProps {
  account: Account
}

export function AccountCard({ account }: AccountCardProps) {
  const config = ACCOUNT_TYPE_CONFIG[account.type]
  const { Icon, label } = config
  const isNegative = account.balanceCents < 0

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-gray-600">{account.name}</CardTitle>
        <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
      </CardHeader>
      <CardContent>
        <p
          className={`text-2xl font-bold tracking-tight ${
            isNegative ? 'text-red-600' : 'text-green-700'
          }`}
        >
          {formatBRL(account.balanceCents)}
        </p>
        <p className="mt-1 text-xs text-gray-400">{account.currency}</p>
      </CardContent>
    </Card>
  )
}
