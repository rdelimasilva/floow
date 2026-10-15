import { describe, expect, it } from 'vitest'
import { registrarSaldoDeAbertura } from '@/lib/openfinance/saldo-de-abertura'

/**
 * Itaú: extrato desde 08/09/2025, banco com R$ 33,92 apurados em 14/10/2026,
 * extrato somando −R$ 235,60. Antes do extrato a conta tinha R$ 269,52.
 */

function montar(opts: { jaTem?: boolean; anterior?: boolean } = {}) {
  const inseridas: any[] = []
  let saldo = 0
  let selects = 0
  const db: any = {
    select: () => {
      const n = selects++
      const resultado = n === 0 ? (opts.jaTem ? [{ id: 'a' }] : []) : (opts.anterior ? [{ id: 'b' }] : [])
      const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r) }
      for (const m of ['from', 'where', 'limit']) c[m] = () => c
      return c
    },
    transaction: async (fn: (tx: any) => Promise<void>) => fn({
      insert: () => ({ values: async (v: any) => { inseridas.push(v) } }),
      update: () => ({ set: () => ({ where: async () => { saldo++ } }) }),
    }),
  }
  const client: any = {
    getResourceDetail: async () => ({
      balance: { available_amount: { amount: '33.92', currency: 'BRL' }, update_date_time: '2026-10-14T15:28:34Z' },
    }),
  }
  return { db, client, inseridas, saldoAtualizado: () => saldo }
}

const extrato = (over: Partial<{ incompleto: boolean }> = {}) => ({
  primeiroDia: '2025-09-08',
  incompleto: false,
  // Lançamento de amanhã não entra: o saldo foi apurado hoje.
  somaAte: (dia: string) => (dia >= '2026-10-15' ? -23560 + 10000 : -23560),
  ...over,
})
const args = (db: any, client: any, e = extrato()) => [db, client, { orgId: 'org', accountId: 'itau', polpResourceId: 'r', extrato: e }] as const

describe('registrarSaldoDeAbertura', () => {
  it('saldo do banco menos o extrato, no dia anterior ao primeiro lançamento', async () => {
    const { db, client, inseridas, saldoAtualizado } = montar()

    expect(await registrarSaldoDeAbertura(...args(db, client))).toBe(26952)
    expect(inseridas[0]).toMatchObject({
      amountCents: 26952, type: 'income', origem: 'ajuste', affectsCashFlow: false, externalId: 'saldo-de-abertura',
    })
    expect(inseridas[0].date.toISOString().slice(0, 10)).toBe('2025-09-07')
    expect(saldoAtualizado()).toBe(1)
  })

  it('uma vez só: já gravado, não refaz', async () => {
    const { db, client, inseridas } = montar({ jaTem: true })
    expect(await registrarSaldoDeAbertura(...args(db, client))).toBeNull()
    expect(inseridas).toHaveLength(0)
  })

  it('conta com histórico anterior ao extrato já tem esse saldo', async () => {
    const { db, client, inseridas } = montar({ anterior: true })
    expect(await registrarSaldoDeAbertura(...args(db, client))).toBeNull()
    expect(inseridas).toHaveLength(0)
  })

  it('extrato com item não lido: a soma estaria errada', async () => {
    const { db, client, inseridas } = montar()
    expect(await registrarSaldoDeAbertura(...args(db, client, extrato({ incompleto: true })))).toBeNull()
    expect(inseridas).toHaveLength(0)
  })
})
