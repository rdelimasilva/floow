import { describe, it, expect } from 'vitest'
import { buildPacingEmail } from '@/lib/notifications/pacing-email'

const base = {
  orgName: 'Casa',
  month: '2026-09',
  daysElapsed: 15,
  daysInMonth: 30,
  pacingUrl: 'https://app.floow.com.br/budgets/pacing',
  unsubscribeUrl: 'https://app.floow.com.br/api/email/unsubscribe?token=abc',
  categoryNames: { a: 'Alimentação', b: 'Lazer <script>' } as Record<string, string>,
}

describe('buildPacingEmail', () => {
  it('assunto cita a categoria quando há só uma', () => {
    const e = buildPacingEmail({
      ...base,
      alerts: [{ categoryId: 'a', status: 'estourado', plannedCents: 100000, spentCents: 125000, projectedCents: 250000 }],
    })
    expect(e.subject).toBe('Orçamento estourado: Alimentação')
    expect(e.html).toContain('R$ 1.250,00')
    expect(e.html).toContain('R$ 1.000,00')
    expect(e.text).toContain('Alimentação')
  })

  it('assunto resume quando há várias categorias', () => {
    const e = buildPacingEmail({
      ...base,
      alerts: [
        { categoryId: 'a', status: 'estourado', plannedCents: 100000, spentCents: 125000, projectedCents: 250000 },
        { categoryId: 'b', status: 'risco', plannedCents: 50000, spentCents: 30000, projectedCents: 60000 },
      ],
    })
    expect(e.subject).toBe('Ritmo de gastos: 2 categorias pedem atenção')
  })

  it('escapa nomes de categoria no HTML', () => {
    const e = buildPacingEmail({
      ...base,
      alerts: [{ categoryId: 'b', status: 'risco', plannedCents: 50000, spentCents: 30000, projectedCents: 60000 }],
    })
    expect(e.html).not.toContain('<script>')
    expect(e.html).toContain('Lazer &lt;script&gt;')
  })

  it('traz os links do app e de descadastro', () => {
    const e = buildPacingEmail({
      ...base,
      alerts: [{ categoryId: 'a', status: 'risco', plannedCents: 1, spentCents: 1, projectedCents: 2 }],
    })
    expect(e.html).toContain(base.pacingUrl)
    expect(e.html).toContain(base.unsubscribeUrl)
    expect(e.text).toContain(base.unsubscribeUrl)
  })
})
