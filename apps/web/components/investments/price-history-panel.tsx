'use client'

import { useState, useEffect } from 'react'
import { getPriceHistory } from '@/lib/investments/queries'
import { formatBRL } from '@floow/core-finance/src/balance'
import type { PriceHistoryEntry } from '@/lib/investments/queries'

interface PriceHistoryPanelProps {
  orgId: string
  assetId: string
}

/**
 * Compact panel showing historical price entries for an asset.
 * Fulfills INV-06: view historical prices per asset.
 * Sorted chronologically (oldest first, newest at bottom).
 */
export function PriceHistoryPanel({ orgId, assetId }: PriceHistoryPanelProps) {
  const [entries, setEntries] = useState<PriceHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPriceHistory(orgId, assetId)
      .then((data) => setEntries(data))
      .finally(() => setLoading(false))
  }, [orgId, assetId])

  if (loading) {
    return (
      <div className="px-4 py-3 text-sm text-gray-500">Carregando historico...</div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-gray-500">Nenhum preco registrado</div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-gray-100 bg-gray-50">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-100">
            <th className="px-3 py-2 text-left font-medium text-gray-600">Data</th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">Preco</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, idx) => {
            const dateStr = entry.priceDate instanceof Date
              ? entry.priceDate.toLocaleDateString('pt-BR')
              : new Date(entry.priceDate as unknown as string).toLocaleDateString('pt-BR')
            return (
              <tr key={idx} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-1.5 text-gray-600">{dateStr}</td>
                <td className="px-3 py-1.5 text-right font-mono text-gray-800">
                  {formatBRL(entry.priceCents)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
