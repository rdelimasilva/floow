'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { createAdjustment } from '@/lib/finance/budget-actions'

interface BudgetAdjustmentDialogProps {
  goalId: string
  open: boolean
  onClose: () => void
}

export function BudgetAdjustmentDialog({ goalId, open, onClose }: BudgetAdjustmentDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const todayStr = new Date().toISOString().slice(0, 10)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      const form = e.currentTarget
      const fd = new FormData(form)
      fd.set('goalId', goalId)
      const amountRaw = fd.get('amountCents') as string
      fd.set('amountCents', String(Math.round(parseFloat(amountRaw.replace(',', '.')) * 100)))
      await createAdjustment(fd)
      toast('Ajuste registrado com sucesso')
      onClose()
    } catch {
      toast('Não foi possível registrar o ajuste. Tente novamente.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[420px] rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">Ajuste Manual</h2>
        <p className="mt-1 text-sm text-gray-500">
          Use valor negativo para subtrair.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Valor (R$)</label>
            <Input name="amountCents" type="text" inputMode="decimal" required placeholder="Ex: -100,00" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Descrição</label>
            <Input name="description" required placeholder="Ex: Reembolso recebido" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Data</label>
            <Input name="date" type="date" required defaultValue={todayStr} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
