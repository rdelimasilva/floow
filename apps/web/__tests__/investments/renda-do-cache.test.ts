/**
 * Renda passiva quebrava com "getUTCFullYear is not a function" (FLOOW-V,
 * 19/10/2026): o unstable_cache guarda o resultado em JSON, então na leitura
 * do cache `eventDate` volta como texto. A conversão para Date precisa rodar
 * depois do cache, não dentro da função cacheada.
 */
import { describe, it, expect, vi } from 'vitest'

const rows = [
  {
    id: 'e1',
    assetId: 'a1',
    eventType: 'dividend',
    eventDate: new Date('2026-09-15T00:00:00Z'),
    totalCents: 1000,
    notes: null,
    ticker: 'ITSA4',
    name: 'Itaúsa',
    source: 'manual',
  },
]

vi.mock('@floow/db', () => {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'from', 'innerJoin', 'where']) chain[m] = () => chain
  chain.orderBy = async () => rows
  return {
    getDb: () => chain,
    assets: {},
    assetPositionSnapshots: {},
    portfolioEvents: {},
    assetPrices: {},
    patrimonySnapshots: {},
  }
})

// Como o cache de verdade: o valor devolvido passa por JSON.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>) => async () => JSON.parse(JSON.stringify(await fn())),
}))

vi.mock('drizzle-orm', () => ({
  eq: () => null, and: () => null, desc: () => null, asc: () => null,
  inArray: () => null, gte: () => null, sql: () => null,
}))

import { getIncomeEvents } from '@/lib/investments/queries'

describe('getIncomeEvents lido do cache', () => {
  it('devolve eventDate como Date', async () => {
    const [evento] = await getIncomeEvents('org', 12)
    expect(evento.eventDate).toBeInstanceOf(Date)
    expect(evento.eventDate.toISOString()).toBe('2026-09-15T00:00:00.000Z')
  })
})
