'use client'

import { formatBRL } from '@floow/core-finance/src/balance'

interface TransactionRow {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amountCents: number
  description: string
  date: Date | string
  accountId: string
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
  transferGroupId?: string | null
}

interface TransactionListProps {
  transactions: TransactionRow[]
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const TYPE_STYLES = {
  income: 'text-green-700',
  expense: 'text-red-600',
  transfer: 'text-blue-600',
} as const

const TYPE_LABELS = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
} as const

export function TransactionList({ transactions }: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
        <p className="text-gray-500">Nenhuma transação encontrada.</p>
        <p className="mt-1 text-sm text-gray-400">
          Registre sua primeira transação para começar.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Data
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Descrição
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Categoria
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Tipo
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
              Valor
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {transactions.map((tx) => (
            <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {formatDate(tx.date)}
              </td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                {tx.description}
              </td>
              <td className="px-4 py-3">
                {tx.categoryName ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: tx.categoryColor ? `${tx.categoryColor}20` : '#e5e7eb',
                      color: tx.categoryColor ?? '#6b7280',
                    }}
                  >
                    {tx.categoryIcon && <span>{tx.categoryIcon}</span>}
                    {tx.categoryName}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">
                {TYPE_LABELS[tx.type]}
              </td>
              <td
                className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${TYPE_STYLES[tx.type]}`}
              >
                {tx.amountCents >= 0 ? '+' : ''}
                {formatBRL(tx.amountCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
