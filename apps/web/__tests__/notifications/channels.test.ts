import { describe, it, expect, vi } from 'vitest'
import { createEmailChannel } from '@/lib/notifications/channels/email'
import { createWhatsAppChannel, summaryParams, WA_TEMPLATES } from '@/lib/notifications/channels/whatsapp'
import type { ChannelMessage, Recipient } from '@/lib/notifications/channels/types'
import type { PacingSummary } from '@/lib/notifications/pacing-summary'
import { verifyUnsubscribeToken } from '@/lib/notifications/unsubscribe-token'
import type { SendEmailInput } from '@/lib/notifications/send-email'
import type { TemplateMessage } from '@/lib/notifications/send-whatsapp'

const USER = '6f1c2b3a-1111-4222-8333-944455556666'
const ORG = '11111111-2222-4333-8444-555566667777'

const summary: PacingSummary = {
  orgName: 'Casa', monthName: 'setembro', day: 25, daysInMonth: 30,
  plannedCents: 800000, expectedCents: 666667, spentCents: 712000, pctOfExpected: 107,
  projectedCents: 854000, projectedDiffCents: 54000, flagged: 'Alimentação estourado',
  pacingUrl: 'https://app.test/budgets/pacing',
}
const msg = (kind: 'summary' | 'alert'): ChannelMessage => ({
  kind, orgId: ORG, orgName: 'Casa', month: '2026-09', daysElapsed: 25, daysInMonth: 30, summary,
  alerts: [{ categoryId: 'a', status: 'estourado', plannedCents: 100000, spentCents: 125000, projectedCents: 150000 }],
  categoryNames: { a: 'Alimentação' }, pacingUrl: summary.pacingUrl,
})
const rec: Recipient = {
  userId: USER, email: 'a@x.com', whatsappPhone: '+5511999998888',
  frequencies: { email: 'alerts', whatsapp: 'weekly' },
}

describe('canal de e-mail', () => {
  const setup = () => {
    const send = vi.fn(async (_i: SendEmailInput) => ({ ok: true as const, id: '1' }))
    return { send, ch: createEmailChannel({ appUrl: 'https://app.test', secret: 's', send }) }
  }

  it('alerta usa o e-mail de alerta e o link de descadastro leva a org', async () => {
    const { send, ch } = setup()
    await ch.send(rec, msg('alert'))
    const arg = send.mock.calls[0][0]
    expect(arg.to).toBe('a@x.com')
    expect(arg.subject).toBe('Orçamento estourado: Alimentação')
    const token = new URL(arg.unsubscribeUrl!).searchParams.get('token')!
    expect(verifyUnsubscribeToken(token, 's')).toEqual({ userId: USER, orgId: ORG })
  })

  it('resumo usa o e-mail de resumo', async () => {
    const { send, ch } = setup()
    await ch.send(rec, msg('summary'))
    const arg = send.mock.calls[0][0]
    expect(arg.subject).toBe('Ritmo de gastos em Casa: 107% do esperado até o dia 25')
    expect(arg.text).toContain('Esperado até hoje: R$ 6.666,67')
    expect(arg.html).toContain('Realizado até hoje: R$ 7.120,00 (107% do esperado)')
  })
})

describe('canal de WhatsApp', () => {
  const setup = () => {
    const sendTemplate = vi.fn(async (_m: TemplateMessage) => ({ ok: true as const, id: 'w' }))
    return { sendTemplate, ch: createWhatsAppChannel({ sendTemplate }) }
  }

  it('resumo manda o template de resumo com 12 parâmetros de uma linha', async () => {
    const { sendTemplate, ch } = setup()
    await ch.send(rec, msg('summary'))
    const arg = sendTemplate.mock.calls[0][0]
    expect(arg.to).toBe('+5511999998888')
    expect(arg.template).toBe(WA_TEMPLATES.summary)
    expect(arg.bodyParams).toEqual(summaryParams(summary))
    expect(arg.bodyParams).toHaveLength(12)
    expect(arg.bodyParams).toEqual([
      'Casa', 'setembro', '25', '30', 'R$ 8.000,00', 'R$ 6.666,67', 'R$ 7.120,00', '107%',
      'R$ 8.540,00', 'estoura em R$ 540,00', 'Alimentação estourado', 'https://app.test/budgets/pacing',
    ])
    for (const p of arg.bodyParams) expect(p).not.toMatch(/[\n\t]| {5,}/)
  })

  it('alerta manda o template de alerta', async () => {
    const { sendTemplate, ch } = setup()
    await ch.send(rec, msg('alert'))
    expect(sendTemplate.mock.calls[0][0]).toMatchObject({
      template: WA_TEMPLATES.alert,
      bodyParams: ['Casa', 'Alimentação estourou o teto', 'https://app.test/budgets/pacing'],
    })
  })

  it('sem número verificado não tenta enviar', async () => {
    const { sendTemplate, ch } = setup()
    const r = await ch.send({ ...rec, whatsappPhone: null }, msg('summary'))
    expect(r).toEqual({ ok: false, error: 'no_phone' })
    expect(sendTemplate).not.toHaveBeenCalled()
  })
})
