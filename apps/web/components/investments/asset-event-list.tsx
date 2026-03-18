'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatBRL } from '@floow/core-finance'
import { deletePortfolioEvent } from '@/lib/investments/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'

interface EventRow {
  id: string
  eventType: string
  eventTypeLabel: string
  eventDate: Date
  quantity: number | null
  priceCents: number | null
  totalCents: number | null
  splitRatio: string | null
  notes: string | null
}

interface AssetEventListProps {
  events: EventRow[]
}

export function AssetEventList({ events }: AssetEventListProps) {
  const { toast } = useToast()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(id: string) {
    setDeleting(true)
    try {
      const formData = new FormData()
      formData.append('id', id)
      await deletePortfolioEvent(formData)
      setConfirmDeleteId(null)
      toast('Evento removido com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao remover evento', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const deletingEvent = events.find((e) => e.id === confirmDeleteId)

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-2 font-medium">Tipo</th>
              <th className="pb-2 font-medium">Data</th>
              <th className="pb-2 font-medium text-right">Qtd</th>
              <th className="pb-2 font-medium text-right">Preço</th>
              <th className="pb-2 font-medium text-right">Total</th>
              <th className="pb-2 font-medium">Notas</th>
              <th className="pb-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-2 font-medium text-gray-900">
                  {event.eventTypeLabel}
                  {event.splitRatio ? ` (${event.splitRatio}x)` : ''}
                </td>
                <td className="py-2 text-gray-600">
                  {new Date(event.eventDate).toLocaleDateString('pt-BR')}
                </td>
                <td className="py-2 text-right tabular-nums text-gray-700">
                  {event.quantity != null ? event.quantity.toLocaleString('pt-BR') : '—'}
                </td>
                <td className="py-2 text-right tabular-nums text-gray-700">
                  {event.priceCents != null ? formatBRL(event.priceCents) : '—'}
                </td>
                <td className="py-2 text-right tabular-nums font-medium text-gray-900">
                  {event.totalCents != null ? formatBRL(event.totalCents) : '—'}
                </td>
                <td className="py-2 text-gray-500 max-w-[160px] truncate">
                  {event.notes || '—'}
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/investments/events/${event.id}/edit`}
                      className="text-xs text-gray-500 hover:text-gray-800 underline"
                    >
                      Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(event.id)}
                      className="text-xs text-red-500 hover:text-red-700 underline"
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmDeleteId && (
        <ConfirmDialog
          open={!!confirmDeleteId}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={() => handleDelete(confirmDeleteId)}
          title="Remover evento"
          description={`Tem certeza que deseja remover o evento de ${deletingEvent?.eventTypeLabel ?? ''}? O saldo da conta será revertido automaticamente.`}
          confirmLabel="Remover"
          loading={deleting}
        />
      )}
    </>
  )
}
