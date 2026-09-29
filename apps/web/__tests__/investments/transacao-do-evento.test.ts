import { describe, it, expect, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { inserirTransacaoDoEvento } from '@/lib/investments/transacao-do-evento'

const inseridos: Record<string, unknown>[] = []
const atualizadas: string[] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['where', 'returning', 'set']) c[m] = () => c
  return c
}
const tx: any = {
  insert: () => ({ values: (v: Record<string, unknown>) => { inseridos.push(v); return chain([{ id: 'tx-1' }]) } }),
  update: (t: any) => { atualizadas.push(getTableName(t)); return chain([]) },
}

beforeEach(() => { inseridos.length = 0; atualizadas.length = 0 })

describe('inserirTransacaoDoEvento', () => {
  it('compra: despesa com origem investimento, saldo e vínculo do evento', async () => {
    await inserirTransacaoDoEvento(tx, {
      orgId: 'org-1', accountId: 'corrente', eventId: 'ev-1', eventType: 'buy',
      eventDate: new Date('2026-09-10T12:00:00Z'), totalCents: 150000, assetTicker: 'PETR4',
    })
    expect(inseridos[0]).toMatchObject({ origem: 'investimento', type: 'expense', amountCents: -150000, description: 'buy: PETR4' })
    expect(atualizadas).toEqual(['accounts', 'portfolio_events'])
  })

  it('desdobramento não move caixa', async () => {
    await inserirTransacaoDoEvento(tx, {
      orgId: 'org-1', accountId: 'corrente', eventId: 'ev-2', eventType: 'split',
      eventDate: new Date('2026-09-10T12:00:00Z'), totalCents: 1, assetTicker: 'PETR4',
    })
    expect(inseridos).toEqual([])
    expect(atualizadas).toEqual([])
  })
})
