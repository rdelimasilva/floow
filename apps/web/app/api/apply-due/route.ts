import { NextResponse } from 'next/server'
import { getVerifiedIdentity } from '@/lib/auth/session'
import { applyDueBankTransactions } from '@/lib/finance/apply-due'

/**
 * POST /api/apply-due
 *
 * Aplica no saldo o lançamento DO BANCO cuja data já chegou — o agendado e o
 * de data futura, que o sync grava com `balance_applied = false` e nunca
 * revisita. Previsão de template não passa por aqui: ela só entra no saldo
 * através do realizado que a cumpre.
 *
 * Chamado do cliente depois do carregamento, para nunca bloquear a renderização.
 * Protegido por sessão.
 */
export async function POST() {
  const identity = await getVerifiedIdentity()

  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await applyDueBankTransactions()
    return NextResponse.json({ ok: true })
  } catch (err) {
    // Falha aqui não é fatal: a próxima carga tenta de novo.
    console.error('[apply-due] Falhou:', err)
    return NextResponse.json({ error: 'Apply failed' }, { status: 500 })
  }
}
