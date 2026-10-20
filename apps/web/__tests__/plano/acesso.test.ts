import { describe, it, expect } from 'vitest'
import { calcularAcesso, fimDoTrial, LANCAMENTO_DOS_LIMITES } from '@/lib/plano/acesso'

const dia = (iso: string) => new Date(`${iso}T12:00:00Z`)

describe('fimDoTrial', () => {
  it('org antiga conta do lançamento dos limites', () => {
    expect(fimDoTrial(dia('2026-01-10')).getTime()).toBe(LANCAMENTO_DOS_LIMITES.getTime() + 30 * 86_400_000)
  })

  it('org nova conta da própria criação', () => {
    expect(fimDoTrial(dia('2026-12-01')).toISOString()).toBe('2026-12-31T12:00:00.000Z')
  })
})

describe('calcularAcesso', () => {
  it('assinatura Pro ativa é Pro sem trial', () => {
    expect(calcularAcesso({ planTier: 'pro', status: 'active' }, dia('2026-01-10'), dia('2027-06-01')))
      .toEqual({ pro: true, trialAte: null, motivo: 'assinatura' })
  })

  it('pagamento atrasado continua Pro enquanto o Stripe tenta cobrar', () => {
    expect(calcularAcesso({ planTier: 'pro', status: 'past_due' }, dia('2026-01-10'), dia('2027-06-01')).pro).toBe(true)
  })

  it('assinatura cancelada cai para o trial e depois para o Free', () => {
    const cancelada = { planTier: 'pro', status: 'canceled' } as const
    expect(calcularAcesso(cancelada, dia('2026-01-10'), dia('2026-11-01')).motivo).toBe('trial')
    expect(calcularAcesso(cancelada, dia('2026-01-10'), dia('2026-12-01')).motivo).toBe('free')
  })

  it('sem assinatura: Pro durante os 30 dias, Free depois', () => {
    expect(calcularAcesso(null, dia('2026-12-01'), dia('2026-12-30')).pro).toBe(true)
    expect(calcularAcesso(null, dia('2026-12-01'), dia('2027-01-01')).pro).toBe(false)
  })
})
