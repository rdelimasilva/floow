'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatBRL } from '@floow/core-finance'
import { deletePortfolioEvent } from '@/lib/investments/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import type { IncomeEventWithAsset } from '@/lib/investments/queries'

const EVENT_TYPE_LABELS: Record<string, string> = {
  dividend: 'Dividendo',
  interest: 'Juros',
  amortization: 'Amortização',
}

interface IncomeEventTableProps {
  events: IncomeEventWithAsset[]
}

export function IncomeEventTable({ events }: IncomeEventTableProps) {
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
              <th className="pb-2 font-medium">Ativo</th>
              <th className="pb-2 font-medium">Tipo</th>
              <th className="pb-2 font-medium">Data</th>
              <th className="pb-2 font-medium text-right">Valor</th>
              <th className="pb-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-b last:border-0">
                <td className="py-2 font-medium">{event.ticker}</td>
                <td className="py-2 text-gray-600">
                  {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                </td>
                <td className="py-2 text-gray-600">
                  {new Date(event.eventDate).toLocaleDateString('pt-BR')}
                </td>
                <td className="py-2 text-right text-green-700 font-medium">
                  {formatBRL(event.totalCents ?? 0)}
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
          description={`Tem certeza que deseja remover o evento de ${deletingEvent ? EVENT_TYPE_LABELS[deletingEvent.eventType] ?? deletingEvent.eventType : ''} de "${deletingEvent?.ticker ?? ''}"?`}
          confirmLabel="Remover"
          loading={deleting}
        />
      )}
    </>
  )
}
