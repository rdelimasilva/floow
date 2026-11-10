import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))

// Sem maxDuration, o Hobby sem fluid compute corta em 10 s; 60 s é o teto
// que já passa no deploy (cfo/chat e webhooks/whatsapp declaram o mesmo).
describe('rotas de mercado', () => {
  it.each(['mercado-bcb', 'mercado-cvm-cotas', 'mercado-cvm-extrato', 'mercado-tesouro', 'mercado-b3'])('%s declara maxDuration de 60 s', async (rota) => {
    const m = await import(`@/app/api/cron/${rota}/route`)
    expect(m.maxDuration).toBe(60)
  })
})
