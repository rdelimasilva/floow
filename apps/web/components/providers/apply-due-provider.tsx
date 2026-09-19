'use client'

import { useEffect } from 'react'

/**
 * Dispara, depois da montagem, a aplicação no saldo do lançamento do banco
 * cuja data já chegou (`POST /api/apply-due`).
 *
 * Era `ReconcileProvider`, e o nome mentia: o que ele disparava aplicava
 * qualquer linha pendente, previsão de template inclusive — estimativa dentro
 * de `accounts.balance_cents` e, de quebra, previsão fora da fila de
 * casamento. Hoje o alvo é só o lançamento do banco, que o sync grava
 * pendente e não revisita.
 *
 * Fire-and-forget: sem await, sem erro na cara do usuário.
 */
export function ApplyDueProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const throttleKey = 'floow.applyDue.lastRunAt'
    const now = Date.now()
    const lastRunAt = Number(localStorage.getItem(throttleKey) ?? '0')

    // Manutenção: no máximo uma vez por dia por navegador.
    if (now - lastRunAt < 24 * 60 * 60 * 1000) {
      return
    }

    localStorage.setItem(throttleKey, String(now))

    fetch('/api/apply-due', { method: 'POST' }).catch(() => {
      // Silencioso — a próxima carga tenta de novo.
      localStorage.removeItem(throttleKey)
    })
  }, [])

  return <>{children}</>
}
