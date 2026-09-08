'use client'

import { memo } from 'react'
import Link from 'next/link'
import { Pencil, Trash2, Zap, EyeOff, Eye, Repeat, XCircle, Package } from 'lucide-react'
import { formatBRL } from '@floow/core-finance'
import { formatDate, TYPE_STYLES, TYPE_LABELS, type TransactionRowData } from './transaction-list-types'
import { affectsCashFlowState } from '@/lib/finance/affects-cash-flow-cycle'

interface RowActions {
  onEdit: (tx: TransactionRowData) => void
  onDelete: (tx: TransactionRowData) => void
  onIgnore: (tx: TransactionRowData) => void
  onToggleCashFlow: (tx: TransactionRowData) => void
  onCancelRecurring: (templateId: string, description: string) => void
  onCreateRule: (matchValue: string, categoryId: string) => void
  onToggleSelect: (id: string) => void
}

interface MobileCardProps {
  tx: TransactionRowData
  balance: number
  isSelected: boolean
  loading: boolean
  actions: RowActions
}

/**
 * O lancamento adquiriu um bem. Existe para quem chega pelo extrato entender
 * uma saida grande — sem isso o vinculo de
 * `fixed_assets.acquisition_transaction_id` so era visivel a partir do ativo.
 */
/**
 * Cicla a excecao de fluxo de caixa do lancamento. O rotulo curto ("herda",
 * "fora", "dentro") cabe na linha; o `title` explica o que o proximo clique
 * faz, porque tres estados nao se adivinham por icone.
 */
function CashFlowToggleButton({
  tx, loading, onToggle,
}: {
  tx: TransactionRowData
  loading: boolean
  onToggle: (tx: TransactionRowData) => void
}) {
  const estado = affectsCashFlowState(tx.affectsCashFlow)
  const herda = tx.affectsCashFlow === null || tx.affectsCashFlow === undefined

  return (
    <button
      type="button"
      onClick={() => onToggle(tx)}
      disabled={loading}
      title={estado.title}
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
        herda
          ? 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          : tx.affectsCashFlow === false
            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
      }`}
    >
      {estado.label}
    </button>
  )
}

function AcquiredAssetBadge({ assetId, assetName }: { assetId: string; assetName: string }) {
  return (
    <Link
      href={`/fixed-assets/${assetId}`}
      className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100"
      title={`Este lancamento adquiriu ${assetName}`}
    >
      <Package className="h-3 w-3" />
      {assetName}
    </Link>
  )
}

export const TransactionMobileCard = memo(function TransactionMobileCard({
  tx, balance, isSelected, loading, actions,
}: MobileCardProps) {
  return (
    <div
      className={`rounded-lg border bg-white p-3 ${isSelected ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'} ${tx.isIgnored ? 'opacity-40' : ''} ${tx.balanceApplied === false ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <input type="checkbox" checked={isSelected} onChange={() => actions.onToggleSelect(tx.id)} className="mt-1 h-4 w-4 rounded border-gray-300 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
            {tx.recurringTemplateId && <Repeat className="h-3 w-3 text-blue-400 shrink-0" />}
            {tx.description}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">{formatDate(tx.date)}</span>
            {tx.categoryName && (
              <span
                className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: tx.categoryColor ? `${tx.categoryColor}20` : '#e5e7eb',
                  color: tx.categoryColor ?? '#6b7280',
                }}
              >
                {tx.categoryName}
              </span>
            )}
            {tx.acquiredAssetId && tx.acquiredAssetName && (
              <AcquiredAssetBadge assetId={tx.acquiredAssetId} assetName={tx.acquiredAssetName} />
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-semibold ${TYPE_STYLES[tx.type]}`}>
            {tx.amountCents >= 0 ? '+' : ''}{formatBRL(tx.amountCents)}
          </p>
          <p className={`text-xs ${balance >= 0 ? 'text-gray-500' : 'text-red-500'}`}>
            Saldo: {formatBRL(balance)}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <span className="text-[10px] text-gray-400 uppercase">{TYPE_LABELS[tx.type]}</span>
        <div className="flex gap-1">
          {tx.recurringTemplateId && (
            <button type="button" title="Cancelar recorrência" onClick={() => actions.onCancelRecurring(tx.recurringTemplateId!, tx.description)} className="rounded p-1 text-gray-400 hover:text-orange-600">
              <XCircle className="h-4 w-4" />
            </button>
          )}
          {!tx.transferGroupId && (
            <button type="button" onClick={() => actions.onEdit(tx)} className="rounded p-1 text-gray-400 hover:text-gray-700">
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <CashFlowToggleButton tx={tx} loading={loading} onToggle={actions.onToggleCashFlow} />
          {tx.externalId ? (
            <button type="button" onClick={() => actions.onIgnore(tx)} disabled={loading} className={`rounded p-1 ${tx.isIgnored ? 'text-blue-500' : 'text-gray-400'}`}>
              {tx.isIgnored ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          ) : (
            <button type="button" onClick={() => actions.onDelete(tx)} className="rounded p-1 text-gray-400 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

interface DesktopRowProps {
  tx: TransactionRowData
  balance: number
  isSelected: boolean
  loading: boolean
  actions: RowActions
}

export const TransactionDesktopRow = memo(function TransactionDesktopRow({
  tx, balance, isSelected, loading, actions,
}: DesktopRowProps) {
  return (
    <tr className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50/50' : ''} ${tx.isIgnored ? 'opacity-40 line-through' : ''} ${tx.balanceApplied === false ? 'opacity-60' : ''}`}>
      <td className="px-4 py-3"><input type="checkbox" checked={isSelected} onChange={() => actions.onToggleSelect(tx.id)} className="h-4 w-4 rounded border-gray-300" /></td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{formatDate(tx.date)}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">
        <span className="flex items-center gap-1.5">
          {tx.recurringTemplateId && (
            <Repeat className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          )}
          {tx.description}
          {tx.acquiredAssetId && tx.acquiredAssetName && (
            <AcquiredAssetBadge assetId={tx.acquiredAssetId} assetName={tx.acquiredAssetName} />
          )}
        </span>
      </td>
      <td className="hidden md:table-cell px-4 py-3">
        {tx.categoryName ? (
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: tx.categoryColor ? `${tx.categoryColor}20` : '#e5e7eb',
                color: tx.categoryColor ?? '#6b7280',
              }}
            >
              {tx.categoryName}
            </span>
            {tx.isAutoCategorized && (
              <span className="text-[9px] text-blue-500 font-medium ml-0.5 uppercase tracking-wider">auto</span>
            )}
          </span>
        ) : (
          <span className="text-xs text-gray-400">&mdash;</span>
        )}
      </td>
      <td className="hidden md:table-cell px-4 py-3 text-xs text-gray-500">{TYPE_LABELS[tx.type]}</td>
      <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${TYPE_STYLES[tx.type]}`}>
        {tx.amountCents >= 0 ? '+' : ''}{formatBRL(tx.amountCents)}
      </td>
      <td className={`hidden lg:table-cell whitespace-nowrap px-4 py-3 text-right text-sm font-medium ${balance >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
        {formatBRL(balance)}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1">
          {tx.recurringTemplateId && (
            <button
              type="button"
              title="Cancelar recorrência"
              onClick={() => actions.onCancelRecurring(tx.recurringTemplateId!, tx.description)}
              className="rounded p-1 text-gray-400 hover:bg-orange-50 hover:text-orange-600"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
          {tx.categoryId && (
            <button
              type="button"
              title="Categorizar todas como esta"
              onClick={() => actions.onCreateRule(tx.description, tx.categoryId!)}
              className="rounded p-1 text-gray-400 hover:bg-yellow-50 hover:text-yellow-600"
            >
              <Zap className="h-3.5 w-3.5" />
            </button>
          )}
          {!tx.transferGroupId && (
            <button
              type="button"
              onClick={() => actions.onEdit(tx)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <CashFlowToggleButton tx={tx} loading={loading} onToggle={actions.onToggleCashFlow} />
          {tx.externalId ? (
            <button
              type="button"
              title={tx.isIgnored ? 'Restaurar transação' : 'Ignorar transação'}
              onClick={() => actions.onIgnore(tx)}
              disabled={loading}
              className={`rounded p-1 ${tx.isIgnored ? 'text-blue-500 hover:bg-blue-50 hover:text-blue-700' : 'text-gray-400 hover:bg-yellow-50 hover:text-yellow-600'}`}
            >
              {tx.isIgnored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => actions.onDelete(tx)}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
})
