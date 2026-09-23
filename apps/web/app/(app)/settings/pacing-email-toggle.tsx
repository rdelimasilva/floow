'use client'

import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { setPacingEmailPreference } from '@/lib/notifications/preferences-actions'

export function PacingEmailToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  async function toggle() {
    const next = !enabled
    setEnabled(next)
    setSaving(true)
    try {
      await setPacingEmailPreference(next)
      toast(next ? 'Alerta por e-mail ligado' : 'Alerta por e-mail desligado')
    } catch {
      setEnabled(!next)
      toast('Não foi possível salvar a preferência', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="max-w-2xl rounded-lg border bg-white p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold mb-4">
        <Bell className="h-4 w-4" />
        Notificações
      </h2>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Alerta de ritmo de gastos por e-mail</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Um e-mail quando uma categoria entra em risco de estourar o teto ou estoura. Não
            repete o mesmo aviso no mês.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Alerta de ritmo de gastos por e-mail"
          disabled={saving}
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            enabled ? 'bg-primary' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </section>
  )
}
