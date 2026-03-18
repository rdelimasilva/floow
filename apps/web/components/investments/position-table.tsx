'use client'

import { useState, useMemo, memo } from 'react'
import Link from 'next/link'
import { formatBRL } from '@floow/core-finance'
import { updateAssetPrice, deleteAsset } from '@/lib/investments/actions'
import { PriceHistoryPanel } from './price-history-panel'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import type { EnrichedPosition } from '@/lib/investments/queries'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PositionTableProps {
  positions: EnrichedPosition[]
  orgId: string
}

const ASSET_CLASS_LABELS: Record<string, string> = {
  br_equity: 'Ações BR',
  fii: 'FIIs',
  etf: 'ETFs',
  crypto: 'Cripto',
  fixed_income: 'Renda Fixa',
  international: 'Internacional',
}

// ── Row Component ──────────────────────────────────────────────────────────────

const PositionRow = memo(function PositionRow({
  position,
  orgId,
}: {
  position: EnrichedPosition
  orgId: string
}) {
  const { toast } = useToast()
  const [showHistory, setShowHistory] = useState(false)
  const [showPriceInput, setShowPriceInput] = useState(false)
  const [priceInput, setPriceInput] = useState('')
  const [updating, setUpdating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const pnlColor = position.unrealizedPnLCents >= 0
    ? 'text-green-700'
    : 'text-red-600'

  async function handleDeleteAsset() {
    setDeleting(true)
    try {
      const formData = new FormData()
      formData.append('id', position.assetId)
      await deleteAsset(formData)
      setConfirmDelete(false)
      toast('Ativo removido com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao remover ativo', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function handlePriceUpdate() {
    const priceCents = Math.round(parseFloat(priceInput.replace(',', '.')) * 100)
    if (isNaN(priceCents) || priceCents <= 0) return

    setUpdating(true)
    try {
      const formData = new FormData()
      formData.append('assetId', position.assetId)
      formData.append('priceCents', String(priceCents))
      formData.append('priceDate', new Date().toISOString().split('T')[0])
      await updateAssetPrice(formData)
      setShowPriceInput(false)
      setPriceInput('')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        {/* Ticker */}
        <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-900">
          {position.ticker}
        </td>
        {/* Name */}
        <td className="px-4 py-3 text-sm text-gray-700 max-w-[160px] truncate">
          {position.name}
        </td>
        {/* Classe */}
        <td className="px-4 py-3 text-xs text-gray-500">
          {ASSET_CLASS_LABELS[position.assetClass] ?? position.assetClass}
        </td>
        {/* Qtd */}
        <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-800">
          {position.quantityHeld.toLocaleString('pt-BR')}
        </td>
        {/* PM (avg cost) */}
        <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">
          {formatBRL(position.avgCostCents)}
        </td>
        {/* Preço Atual */}
        <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">
          {position.currentPriceCents > 0 ? formatBRL(position.currentPriceCents) : '—'}
        </td>
        {/* Valor Atual */}
        <td className="px-4 py-3 text-right text-sm tabular-nums font-medium text-gray-900">
          {formatBRL(position.currentValueCents)}
        </td>
        {/* P&L % */}
        <td className={`px-4 py-3 text-right text-sm tabular-nums font-medium ${pnlColor}`}>
          {position.unrealizedPnLPercent > 0 ? '+' : ''}{position.unrealizedPnLPercent.toFixed(2)}%
        </td>
        {/* P&L R$ */}
        <td className={`px-4 py-3 text-right text-sm tabular-nums font-medium ${pnlColor}`}>
          {position.unrealizedPnLCents >= 0 ? '+' : ''}{formatBRL(position.unrealizedPnLCents)}
        </td>
        {/* Dividendos */}
        <td className="px-4 py-3 text-right text-sm tabular-nums text-green-700">
          {position.totalDividendsCents > 0 ? formatBRL(position.totalDividendsCents) : '—'}
        </td>
        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              {showHistory ? 'Fechar' : 'Histórico'}
            </button>
            <button
              type="button"
              onClick={() => setShowPriceInput((v) => !v)}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              Preço
            </button>
            <Link
              href={`/investments/${position.assetId}/edit`}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              Editar
            </Link>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-500 hover:text-red-700 underline"
            >
              Excluir
            </button>
          </div>
        </td>
      </tr>

      {/* Inline price update row */}
      {showPriceInput && (
        <tr className="border-b border-gray-100 bg-blue-50">
          <td colSpan={11} className="px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-700">Novo preço para {position.ticker}:</span>
              <Input
                type="text"
                placeholder="Ex: 42,50"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="h-7 w-32 text-xs"
              />
              <Button
                size="sm"
                onClick={handlePriceUpdate}
                disabled={updating || !priceInput}
                className="h-7 text-xs"
              >
                {updating ? 'Salvando...' : 'Salvar'}
              </Button>
              <button
                type="button"
                onClick={() => { setShowPriceInput(false); setPriceInput('') }}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                Cancelar
              </button>
            </div>
          </td>
        </tr>
      )}

      {/* Expandable price history panel */}
      {showHistory && (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={11} className="px-4 py-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-600">Histórico de Preços — {position.ticker}</p>
              <PriceHistoryPanel orgId={orgId} assetId={position.assetId} />
            </div>
          </td>
        </tr>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <tr>
          <td colSpan={11} className="p-0">
            <ConfirmDialog
              open={confirmDelete}
              onClose={() => setConfirmDelete(false)}
              onConfirm={handleDeleteAsset}
              title="Remover ativo"
              description={`Tem certeza que deseja remover "${position.ticker}"? Todos os eventos e preços serão removidos. Transações vinculadas terão seus saldos revertidos.`}
              confirmLabel="Remover"
              loading={deleting}
            />
          </td>
        </tr>
      )}
    </>
  )
})

// ── Main Component ─────────────────────────────────────────────────────────────

export function PositionTable({ positions, orgId }: PositionTableProps) {
  // Compute totals once with useMemo to avoid recalculating on every render
  const { totalValueCents, totalUnrealizedPnLCents, totalDividendsCents, totalUnrealizedPnLPercent } = useMemo(() => {
    const value = positions.reduce((sum, p) => sum + p.currentValueCents, 0)
    const pnl = positions.reduce((sum, p) => sum + p.unrealizedPnLCents, 0)
    const dividends = positions.reduce((sum, p) => sum + p.totalDividendsCents, 0)
    const totalCost = positions.reduce((sum, p) => sum + p.totalCostCents, 0)
    const pnlPercent = totalCost > 0 ? Math.round((pnl / totalCost) * 10000) / 100 : 0
    return { totalValueCents: value, totalUnrealizedPnLCents: pnl, totalDividendsCents: dividends, totalUnrealizedPnLPercent: pnlPercent }
  }, [positions])

  const totalPnLColor = totalUnrealizedPnLCents >= 0 ? 'text-green-700' : 'text-red-600'

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Ticker</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nome</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Classe</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Qtd</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">PM</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Preço Atual</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Valor Atual</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">P&L (%)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">P&L (R$)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Dividendos</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Ações</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => (
            <PositionRow key={position.assetId} position={position} orgId={orgId} />
          ))}
        </tbody>
        {/* Totals row */}
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-gray-50">
            <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-gray-700">
              Total ({positions.length} ativos)
            </td>
            <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-900">
              {formatBRL(totalValueCents)}
            </td>
            <td className={`px-4 py-3 text-right text-sm font-bold tabular-nums ${totalPnLColor}`}>
              {totalUnrealizedPnLPercent > 0 ? '+' : ''}{totalUnrealizedPnLPercent.toFixed(2)}%
            </td>
            <td className={`px-4 py-3 text-right text-sm font-bold tabular-nums ${totalPnLColor}`}>
              {totalUnrealizedPnLCents >= 0 ? '+' : ''}{formatBRL(totalUnrealizedPnLCents)}
            </td>
            <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-green-700">
              {totalDividendsCents > 0 ? formatBRL(totalDividendsCents) : '—'}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
