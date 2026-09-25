import { describe, it, expect, vi, afterEach } from 'vitest'
import type { BudgetPacingAnalyzerInput } from '@floow/core-finance'
import { runPacingAlertsForOrg, type PacingAlertsDeps } from '@/lib/notifications/pacing-alerts-job'
import type { Recipient } from '@/lib/notifications/channels/types'

const SEGUNDA = 28 // 28/09/2026
const TERCA = 29

function input(day: number, over: { plannedCents?: number } = {}): BudgetPacingAnalyzerInput {
  return {
    month: '2026-09',
    categoryNames: { a: 'Alimentação' },
    pacing: {
      series: [],
      total: {
        plannedCents: over.plannedCents ?? 100000, spentCents: 90000, unbudgetedCents: 0,
        projectedCents: 180000, confidence: 'normal', daysElapsed: day, daysInMonth: 30,
      },
      byCategory: [{ categoryId: 'a', plannedCents: 100000, spentCents: 120000, projectedCents: 240000, status: 'estourado' }],
    },
  } as BudgetPacingAnalyzerInput
}

const rec = (userId: string, email: Recipient['frequencies']['email'], whatsapp: Recipient['frequencies']['whatsapp']): Recipient => ({
  userId, email: `${userId}@x.com`, whatsappPhone: '+5511999998888', frequencies: { email, whatsapp },
})
const okSend = () => vi.fn(async () => ({ ok: true as const, id: '1' }))
const JA_ENVIADO = { email: { a: 'estourado' as const }, whatsapp: { a: 'estourado' as const } }

function deps(over: Partial<PacingAlertsDeps> = {}): PacingAlertsDeps {
  return {
    loadPacing: vi.fn(async () => input(TERCA)),
    loadLastSent: vi.fn(async () => ({ email: {}, whatsapp: {} })),
    loadRecipients: vi.fn(async () => [rec('u1', 'alerts', 'off')]),
    loadOrgName: vi.fn(async () => 'Casa'),
    saveSent: vi.fn(async () => {}),
    channels: { email: { send: okSend() }, whatsapp: { send: okSend() } },
    appUrl: 'https://app.test',
    ...over,
  }
}

describe('runPacingAlertsForOrg', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('piora nova: e-mail em "alerts" recebe alerta e o estado do e-mail é gravado', async () => {
    const d = deps()
    const r = await runPacingAlertsForOrg('org', d)
    expect(r.sent).toEqual({ email: 1, whatsapp: 0 })
    expect(vi.mocked(d.channels.email.send).mock.calls[0][1]).toMatchObject({
      kind: 'alert', orgName: 'Casa', pacingUrl: 'https://app.test/budgets/pacing',
    })
    expect(d.saveSent).toHaveBeenCalledTimes(1)
    expect(d.saveSent).toHaveBeenCalledWith('org', '2026-09', 'email', [expect.objectContaining({ categoryId: 'a' })])
  })

  it('segunda: WhatsApp semanal recebe resumo mesmo sem piora, e nada é gravado', async () => {
    const d = deps({
      loadPacing: vi.fn(async () => input(SEGUNDA)),
      loadLastSent: vi.fn(async () => JA_ENVIADO),
      loadRecipients: vi.fn(async () => [rec('u1', 'alerts', 'weekly')]),
    })
    const r = await runPacingAlertsForOrg('org', d)
    expect(r.sent).toEqual({ email: 0, whatsapp: 1 })
    expect(vi.mocked(d.channels.whatsapp.send).mock.calls[0][1].kind).toBe('summary')
    expect(d.saveSent).not.toHaveBeenCalled()
  })

  it('terça sem piora: semanal e alertas não recebem nada', async () => {
    const d = deps({
      loadLastSent: vi.fn(async () => JA_ENVIADO),
      loadRecipients: vi.fn(async () => [rec('u1', 'alerts', 'weekly')]),
    })
    const r = await runPacingAlertsForOrg('org', d)
    expect(r.sent).toEqual({ email: 0, whatsapp: 0 })
  })

  it('diário recebe resumo todo dia', async () => {
    const d = deps({
      loadLastSent: vi.fn(async () => JA_ENVIADO),
      loadRecipients: vi.fn(async () => [rec('u1', 'off', 'daily')]),
    })
    const r = await runPacingAlertsForOrg('org', d)
    expect(r.sent).toEqual({ email: 0, whatsapp: 1 })
  })

  it('e-mail falha e WhatsApp não: só o estado do WhatsApp é gravado', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = deps({
      loadRecipients: vi.fn(async () => [rec('u1', 'alerts', 'alerts')]),
      channels: {
        email: { send: vi.fn(async () => ({ ok: false as const, error: 'x' })) },
        whatsapp: { send: okSend() },
      },
    })
    await runPacingAlertsForOrg('org', d)
    expect(d.saveSent).toHaveBeenCalledTimes(1)
    expect(vi.mocked(d.saveSent).mock.calls[0][2]).toBe('whatsapp')
  })

  it('canal que lança exceção não derruba o outro', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = deps({
      loadRecipients: vi.fn(async () => [rec('u1', 'alerts', 'alerts')]),
      channels: {
        email: { send: vi.fn(async () => { throw new Error('boom') }) },
        whatsapp: { send: okSend() },
      },
    })
    const r = await runPacingAlertsForOrg('org', d)
    expect(r.sent).toEqual({ email: 0, whatsapp: 1 })
  })

  it('saveSent lança para um canal: o outro canal ainda envia e grava seu próprio estado', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const saveSent = vi.fn(async (_orgId: string, _month: string, channel: string) => {
      if (channel === 'email') throw new Error('boom')
    })
    const d = deps({
      loadRecipients: vi.fn(async () => [rec('u1', 'alerts', 'alerts')]),
      saveSent,
    })
    const r = await runPacingAlertsForOrg('org', d)
    expect(r.sent).toEqual({ email: 1, whatsapp: 1 })
    expect(saveSent).toHaveBeenCalledTimes(2)
    expect(vi.mocked(saveSent).mock.calls[1][2]).toBe('whatsapp')
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('cada destinatário segue a própria frequência', async () => {
    const d = deps({ loadRecipients: vi.fn(async () => [rec('u1', 'alerts', 'off'), rec('u2', 'off', 'off')]) })
    const r = await runPacingAlertsForOrg('org', d)
    expect(r.sent).toEqual({ email: 1, whatsapp: 0 })
    expect(vi.mocked(d.channels.email.send).mock.calls[0][0].userId).toBe('u1')
  })

  it('org sem orçamento no mês não envia nem o resumo diário', async () => {
    const d = deps({
      loadPacing: vi.fn(async () => input(TERCA, { plannedCents: 0 })),
      loadRecipients: vi.fn(async () => [rec('u1', 'daily', 'daily')]),
    })
    expect((await runPacingAlertsForOrg('org', d)).sent).toEqual({ email: 0, whatsapp: 0 })
    expect(d.loadRecipients).not.toHaveBeenCalled()
  })

  it('mês não iniciado (daysElapsed 0) não envia', async () => {
    const d = deps({ loadPacing: vi.fn(async () => input(0)) })
    expect((await runPacingAlertsForOrg('org', d)).sent).toEqual({ email: 0, whatsapp: 0 })
  })

  it('sem teto definido (loadPacing undefined) não faz nada', async () => {
    const d = deps({ loadPacing: vi.fn(async () => undefined) })
    expect((await runPacingAlertsForOrg('org', d)).sent).toEqual({ email: 0, whatsapp: 0 })
  })
})
