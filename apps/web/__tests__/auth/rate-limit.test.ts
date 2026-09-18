import { describe, it, expect, vi, beforeEach } from 'vitest'
import { consumeRateLimit, windowStart } from '@/lib/rate-limit/consume'

const AGORA = new Date('2026-09-18T14:37:23.000Z')

function fakeDb(contagem: number | Error) {
  return {
    execute: vi.fn(async () => {
      if (contagem instanceof Error) throw contagem
      return [{ count: contagem }]
    }),
  }
}

beforeEach(() => vi.clearAllMocks())

describe('windowStart', () => {
  it('alinha a janela ao múltiplo do tamanho, para todos caírem no mesmo balde', () => {
    expect(windowStart(AGORA, 60).toISOString()).toBe('2026-09-18T14:37:00.000Z')
    expect(windowStart(AGORA, 3600).toISOString()).toBe('2026-09-18T14:00:00.000Z')
  })

  it('dois instantes na mesma janela produzem o mesmo início', () => {
    const a = windowStart(new Date('2026-09-18T14:37:01Z'), 3600)
    const b = windowStart(new Date('2026-09-18T14:59:59Z'), 3600)
    expect(a.getTime()).toBe(b.getTime())
  })
})

describe('consumeRateLimit', () => {
  const opts = { bucket: 'cfo.chat', subject: 'org-1', limit: 10, windowSeconds: 3600, now: AGORA }

  it('libera enquanto a contagem está dentro do limite', async () => {
    const r = await consumeRateLimit(fakeDb(3) as never, opts)

    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(7)
  })

  it('libera exatamente na última chamada permitida', async () => {
    const r = await consumeRateLimit(fakeDb(10) as never, opts)

    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(0)
  })

  it('bloqueia a partir da chamada seguinte ao limite', async () => {
    const r = await consumeRateLimit(fakeDb(11) as never, opts)

    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it('informa quantos segundos faltam até a janela virar', async () => {
    const r = await consumeRateLimit(fakeDb(11) as never, opts)

    // 14:37:23 numa janela de 1h que começou 14:00 -> faltam 22m37s
    expect(r.retryAfterSeconds).toBe(1357)
  })

  it('bloqueia quando o banco falha — proteger a cota vale mais que a conveniência', async () => {
    const r = await consumeRateLimit(fakeDb(new Error('conexao caiu')) as never, opts)

    expect(r.allowed).toBe(false)
  })
})
