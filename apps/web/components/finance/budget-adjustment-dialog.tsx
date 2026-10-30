'use client'

import { useEffect, useId, useRef, useState } from 'react'
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
  const id = useId()
  // <dialog> nativo com showModal(): prende o foco, fecha no Esc e devolve o
  // foco a quem abriu, como no ConfirmDialog.
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

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
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-titulo`}
      onClose={onClose}
      className="w-[calc(100%-2rem)] max-w-[420px] rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      {/* Remonta a cada abertura: o formulário volta limpo, como antes. */}
      {open && (
      <div className="p-6">
        <h2 id={`${id}-titulo`} className="text-lg font-semibold text-gray-900">Ajuste Manual</h2>
        <p className="mt-1 text-sm text-gray-500">
          Use valor negativo para subtrair.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <label htmlFor={`${id}-valor`} className="text-sm font-medium text-gray-700">Valor (R$)</label>
            <Input id={`${id}-valor`} name="amountCents" type="text" inputMode="decimal" required placeholder="Ex: -100,00" />
          </div>

          <div className="space-y-2">
            <label htmlFor={`${id}-descricao`} className="text-sm font-medium text-gray-700">Descrição</label>
            <Input id={`${id}-descricao`} name="description" required placeholder="Ex: Reembolso recebido" />
          </div>

          <div className="space-y-2">
            <label htmlFor={`${id}-data`} className="text-sm font-medium text-gray-700">Data</label>
            <Input id={`${id}-data`} name="date" type="date" min="1900-01-01" max="2100-12-31" required defaultValue={todayStr} />
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
      )}
    </dialog>
  )
}
