import { describe, it, expect, vi } from 'vitest'
import { runPacingEmailForOrg, type PacingEmailDeps } from '@/lib/notifications/pacing-email-job'
import type { BudgetPacingAnalyzerInput } from '@floow/core-finance'

const USER = '6f1c2b3a-1111-4222-8333-944455556666'

function input(status: 'ok' | 'risco' | 'estourado'): BudgetPacingAnalyzerInput {
  return {
    month: '2026-09',
    categoryNames: { a: 'Alimentação' },
    pacing: {
      series: [],
      total: {
        plannedCents: 100000, spentCents: 90000, unbudgetedCents: 0, projectedCents: 180000,
        confidence: 'normal', daysElapsed: 15, daysInMonth: 30,
      },
      byCategory: [{ categoryId: 'a', plannedCents: 100000, spentCents: 120000, projectedCents: 240000, status }],
    },
  }
}

function deps(over: Partial<PacingEmailDeps> = {}): PacingEmailDeps {
  return {
    loadPacing: vi.fn(async () => input('estourado')),
    loadLastSent: vi.fn(async () => ({})),
    loadRecipients: vi.fn(async () => [{ userId: USER, email: 'a@x.com' }]),
    loadOrgName: vi.fn(async () => 'Casa'),
    send: vi.fn(async () => ({ ok: true as const, id: '1' })),
    saveSent: vi.fn(async () => {}),
    appUrl: 'https://app.test',
    secret: 's',
    ...over,
  }
}

describe('runPacingEmailForOrg', () => {
  it('envia e grava o estado quando há alerta novo', async () => {
    const d = deps()
    const r = await runPacingEmailForOrg('org', d)
    expect(r).toEqual({ sent: 1, alerts: 1 })
    const call = vi.mocked(d.send).mock.calls[0][0]
    expect(call.to).toBe('a@x.com')
    expect(call.unsubscribeUrl).toMatch(/^https:\/\/app\.test\/api\/email\/unsubscribe\?token=/)
    expect(d.saveSent).toHaveBeenCalledWith('org', '2026-09', [expect.objectContaining({ categoryId: 'a', status: 'estourado' })])
  })

  it('não envia o que já foi enviado', async () => {
    const d = deps({ loadLastSent: vi.fn(async () => ({ a: 'estourado' as const })) })
    const r = await runPacingEmailForOrg('org', d)
    expect(r.sent).toBe(0)
    expect(d.send).not.toHaveBeenCalled()
    expect(d.loadRecipients).not.toHaveBeenCalled()
  })

  it('sem teto definido não faz nada', async () => {
    const d = deps({ loadPacing: vi.fn(async () => undefined) })
    expect(await runPacingEmailForOrg('org', d)).toEqual({ sent: 0, alerts: 0 })
  })

  it('se todo envio falha, não grava estado — tenta de novo amanhã', async () => {
    const d = deps({ send: vi.fn(async () => ({ ok: false as const, error: 'x' })) })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await runPacingEmailForOrg('org', d)
    expect(r.sent).toBe(0)
    expect(d.saveSent).not.toHaveBeenCalled()
  })

  it('sem destinatário com preferência ligada, não envia nem grava', async () => {
    const d = deps({ loadRecipients: vi.fn(async () => []) })
    await runPacingEmailForOrg('org', d)
    expect(d.send).not.toHaveBeenCalled()
    expect(d.saveSent).not.toHaveBeenCalled()
  })
})
