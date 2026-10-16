import { describe, expect, it } from 'vitest'
import { registrarSaldoDeAbertura, somarExtratoAte } from '@/lib/openfinance/saldo-de-abertura'

/**
 * Itaú: extrato desde 08/09/2025, banco com R$ 33,92 apurados em 14/10/2026,
 * extrato somando −R$ 235,60. Antes do extrato a conta tinha R$ 269,52.
 */

function montar(opts: { jaTem?: { amountCents: number; date: string }; anterior?: boolean } = {}) {
  const inseridas: any[] = []
  const atualizadas: any[] = []
  let saldo = 0
  let selects = 0
  const db: any = {
    select: () => {
      const n = selects++
      const jaTem = opts.jaTem ? [{ id: 'a', amountCents: opts.jaTem.amountCents, date: new Date(`${opts.jaTem.date}T12:00:00Z`) }] : []
      const resultado = n === 0 ? jaTem : (opts.anterior ? [{ id: 'b' }] : [])
      const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r) }
      for (const m of ['from', 'where', 'limit']) c[m] = () => c
      return c
    },
    transaction: async (fn: (tx: any) => Promise<void>) => fn({
      insert: () => ({ values: async (v: any) => { inseridas.push(v) } }),
      update: () => ({ set: (v: any) => ({ where: async () => { atualizadas.push(v); saldo++ } }) }),
    }),
  }
  const client: any = {
    getResourceDetail: async () => ({
      balance: { available_amount: { amount: '33.92', currency: 'BRL' }, update_date_time: '2026-10-14T15:28:34Z' },
    }),
  }
  return { db, client, inseridas, atualizadas, saldoAtualizado: () => saldo }
}

const extrato = (over: Partial<{ incompleto: boolean }> = {}) => ({
  primeiroDia: '2025-09-08',
  incompleto: false,
  // Lançamento de depois da apuração não entra.
  somaAte: (apuracao: Date) => (apuracao >= new Date('2026-10-15T00:00:00Z') ? -23560 + 10000 : -23560),
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

  // A leitura do banco das 08:01 de 15/10 não fechava com o próprio extrato e
  // gravou R$ 698,63; a seguinte deu −R$ 810,67. Gravado uma vez, o erro ficava.
  it('já gravado com a mesma janela: refaz pela leitura nova', async () => {
    const { db, client, inseridas, atualizadas } = montar({ jaTem: { amountCents: 69863, date: '2025-09-07' } })

    expect(await registrarSaldoDeAbertura(...args(db, client))).toBe(26952)
    expect(inseridas).toHaveLength(0)
    expect(atualizadas[0]).toMatchObject({ amountCents: 26952, type: 'income' })
    expect(atualizadas).toHaveLength(2)
  })

  it('já gravado e igual: não mexe', async () => {
    const { db, client, atualizadas } = montar({ jaTem: { amountCents: 26952, date: '2025-09-07' } })
    expect(await registrarSaldoDeAbertura(...args(db, client))).toBeNull()
    expect(atualizadas).toHaveLength(0)
  })

  it('a janela andou: o começo do extrato não vem mais, o gravado fica', async () => {
    const { db, client, atualizadas } = montar({ jaTem: { amountCents: 69863, date: '2025-09-07' } })
    expect(await registrarSaldoDeAbertura(...args(db, client, { ...extrato(), primeiroDia: '2025-10-20' }))).toBeNull()
    expect(atualizadas).toHaveLength(0)
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

describe('somarExtratoAte', () => {
  const apuracao = new Date('2026-10-15T13:37:24Z')

  // A apuração vem sem milésimos e é o instante do último lançamento.
  it('pelo instante, no segundo: o salário das 13:37:24.080 já estava no saldo', () => {
    const itens = [
      { date: '2026-10-14', ocorridoEm: '2026-10-14T15:28:34.048Z', amountCents: 25087 },
      { date: '2026-10-15', ocorridoEm: '2026-10-15T13:37:24.080Z', amountCents: 3204828 },
      { date: '2026-10-15', ocorridoEm: '2026-10-15T13:37:25.000Z', amountCents: -100 },
    ]
    expect(somarExtratoAte(itens, apuracao)).toBe(25087 + 3204828)
  })

  it('sem instante, pelo dia em São Paulo', () => {
    const itens = [
      { date: '2026-10-15', ocorridoEm: null, amountCents: 500 },
      { date: '2026-10-16', ocorridoEm: null, amountCents: 700 },
    ]
    expect(somarExtratoAte(itens, apuracao)).toBe(500)
  })
})
