'use client'

import { memo } from 'react'
import Link from 'next/link'
import { Pencil, Trash2, Zap, EyeOff, Eye, Repeat, XCircle, Package } from 'lucide-react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { formatDate, amountColorClass, TYPE_LABELS, type TransactionRowData } from './transaction-list-types'
import { affectsCashFlowState } from '@/lib/finance/affects-cash-flow-cycle'
import { contaNoSaldoProjetado } from '@/lib/finance/projected-balance'
import { rotuloDeRemocao } from '@/lib/finance/delete-copy'

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
 * O lançamento adquiriu um bem. Existe para quem chega pelo extrato entender
 * uma saída grande — sem isso o vínculo de
 * `fixed_assets.acquisition_transaction_id` só era visível a partir do ativo.
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
  const estado = affectsCashFlowState(tx.affectsCashFlow, tx.categoryAffectsCashFlow)

  return (
    <button
      type="button"
      onClick={() => onToggle(tx)}
      disabled={loading}
      title={estado.title}
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
        estado.excecao
          ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
      }`}
    >
      {estado.label}
      {/* O ponto marca decisão tomada nesta linha. Sem ele, "no fluxo" por
          herança e "no fluxo" por exceção seriam indistinguíveis — e a
          diferença é que a segunda ignora a categoria de agora em diante. */}
      {estado.excecao && <span aria-hidden="true"> •</span>}
    </button>
  )
}

/**
 * "3/6 · compra em 27/07". A parcela de cartão aparece no mês da fatura, e sem
 * a data da compra o usuário não reconheceria o lançamento.
 */
export function textoDaParcela(tx: {
  installmentNumber?: number | null
  installmentTotal?: number | null
  purchaseDate?: Date | string | null
}): string | null {
  if (!tx.purchaseDate || !tx.installmentNumber || !tx.installmentTotal) return null
  const iso = typeof tx.purchaseDate === 'string' ? tx.purchaseDate : tx.purchaseDate.toISOString()
  const [, mes, dia] = iso.slice(0, 10).split('-')
  return `${tx.installmentNumber}/${tx.installmentTotal} · compra em ${dia}/${mes}`
}

function SeloDeParcela({ tx }: { tx: TransactionRowData }) {
  const texto = textoDaParcela(tx)
  if (!texto) return null
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
      {texto}
    </span>
  )
}

/**
 * Estado de conciliação do lançamento, em três valores.
 *
 * Antes eram dois, e o terceiro — o que importa — era invisível: a previsão
 * cuja data chegou e que o banco nunca confirmou. Ela era somada no saldo da
 * conta e ficava sem selo nenhum, idêntica a um lançamento de verdade. Em
 * produção isso pôs R$ 126.746,00 de estimativa de template dentro do saldo
 * de uma conta cujo saldo real era R$ 190,84, com 21 linhas contando dobrado
 * junto com o realizado.
 *
 * Agora a previsão nunca entra em `accounts.balance_cents`, e a vencida sem
 * par sai também do saldo projetado da listagem. Ela não soma em lugar
 * nenhum — então precisa aparecer, porque depende de uma decisão do usuário.
 * Daí o âmbar do "previsto" (informativo, vai acontecer) contra o vermelho do
 * "não conciliado" (pendente, exige ação).
 */
function ForecastBadge({ tx }: { tx: TransactionRowData }) {
  if (tx.balanceApplied !== false) return null

  if (tx.matchedTransactionId) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500"
        title="Previsão já cumprida por um lançamento do banco. Esta linha não entra no saldo."
      >
        confirmado
      </span>
    )
  }

  if (tx.hasPendingMatchProposal) {
    return (
      <Link
        href="/transactions/matches"
        className="inline-flex shrink-0 items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100"
        title="O floow encontrou um lançamento do banco que pode ser este. Decida em Confirmar previsões."
      >
        confirmar?
      </Link>
    )
  }

  if (!contaNoSaldoProjetado(tx, new Date())) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
        title="A data chegou e o banco não trouxe o lançamento correspondente. Não entra em saldo nenhum até ser confirmada."
      >
        não confirmado
      </span>
    )
  }

  return (
    <span
      className="inline-flex shrink-0 items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
      title="Lançamento previsto, ainda não aconteceu. Conta no saldo projetado, não no saldo da conta."
    >
      previsto
    </span>
  )
}

/**
 * A previsao pesa menos que o lancamento de verdade — menos a que exige acao.
 * Apagar a linha "nao conciliada" seria por selo vermelho em texto desbotado.
 */
function classeDeOpacidade(tx: TransactionRowData): string {
  if (tx.balanceApplied !== false) return ''
  if (!tx.matchedTransactionId && !contaNoSaldoProjetado(tx, new Date())) return ''
  return 'opacity-60'
}

function AcquiredAssetBadge({ assetId, assetName }: { assetId: string; assetName: string }) {
  return (
    <Link
      href={`/fixed-assets/${assetId}`}
      className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100"
      title={`Este lançamento adquiriu ${assetName}`}
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
      className={`rounded-lg border bg-white p-3 ${isSelected ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'} ${tx.isIgnored ? 'opacity-40' : ''} ${classeDeOpacidade(tx)}`}
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
            <SeloDeParcela tx={tx} />
            <ForecastBadge tx={tx} />
            {tx.acquiredAssetId && tx.acquiredAssetName && (
              <AcquiredAssetBadge assetId={tx.acquiredAssetId} assetName={tx.acquiredAssetName} />
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-semibold ${amountColorClass(tx.amountCents)}`}>
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
            <button type="button" title="Cancelar recorrência" aria-label="Cancelar recorrência" onClick={() => actions.onCancelRecurring(tx.recurringTemplateId!, tx.description)} className="rounded p-1 text-gray-400 hover:text-orange-600">
              <XCircle className="h-4 w-4" />
            </button>
          )}
          {!tx.transferGroupId && (
            <button type="button" title="Editar lançamento" aria-label="Editar lançamento" onClick={() => actions.onEdit(tx)} className="rounded p-1 text-gray-400 hover:text-gray-700">
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <CashFlowToggleButton tx={tx} loading={loading} onToggle={actions.onToggleCashFlow} />
          {tx.externalId ? (
            <button type="button" title={tx.isIgnored ? 'Restaurar transação' : 'Ignorar transação'} aria-label={tx.isIgnored ? 'Restaurar transação' : 'Ignorar transação'} onClick={() => actions.onIgnore(tx)} disabled={loading} className={`rounded p-1 ${tx.isIgnored ? 'text-blue-500' : 'text-gray-400'}`}>
              {tx.isIgnored ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          ) : (
            <button type="button" title={rotuloDeRemocao(tx)} aria-label={rotuloDeRemocao(tx)} onClick={() => actions.onDelete(tx)} className="rounded p-1 text-gray-400 hover:text-red-600">
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
    <tr className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50/50' : ''} ${tx.isIgnored ? 'opacity-40 line-through' : ''} ${classeDeOpacidade(tx)}`}>
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
          <SeloDeParcela tx={tx} />
          <ForecastBadge tx={tx} />
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
      <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${amountColorClass(tx.amountCents)}`}>
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
              aria-label="Cancelar recorrência"
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
              aria-label="Categorizar todas como esta"
              onClick={() => actions.onCreateRule(tx.description, tx.categoryId!)}
              className="rounded p-1 text-gray-400 hover:bg-yellow-50 hover:text-yellow-600"
            >
              <Zap className="h-3.5 w-3.5" />
            </button>
          )}
          {!tx.transferGroupId && (
            <button
              type="button"
              title="Editar lançamento"
              aria-label="Editar lançamento"
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
              title={rotuloDeRemocao(tx)}
              aria-label={rotuloDeRemocao(tx)}
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
