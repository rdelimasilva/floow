import { describe, expect, it, vi } from 'vitest'
vi.mock('drizzle-orm', async (orig) => ({
  ...(await orig<typeof import('drizzle-orm')>()),
  eq: (_col: unknown, valor: unknown) => valor,
  and: (...partes: unknown[]) => partes,
}))
const { corrigir } = vi.hoisted(() => ({ corrigir: vi.fn(async (..._a: unknown[]) => 'saiu_do_saldo') }))
vi.mock('@/lib/openfinance/parcela-aplicada', () => ({ corrigirDataDaParcelaAplicada: corrigir }))

import { VERSAO_DO_SYNC, precisaReler, refazAbertura, relerHistorico } from '@/lib/openfinance/releitura'

/**
 * Setembro do Master Black: a Polp atualizou a fatura em 04/10, o sync leu com
 * o código que descartava o `bill_id`, e o incremental (`fromUpdatedAt`) nunca
 * mais a trouxe. A releitura preenche o campo nas linhas que já existem.
 */

function polpTx(over: Record<string, unknown> = {}) {
  return {
    id: '01a0870d-aaaa',
    credit_card_id: 'cartao',
    identification_number: '2371',
    transaction_name: 'SHOPPERSAO PAULOBRA',
    credit_debit_type: 'DEBITO',
    transaction_type: 'PAGAMENTO',
    brazilian_amount: { amount: '365.6900', currency: 'BRL' },
    amount: { amount: '365.6900', currency: 'BRL' },
    transaction_date_time: '2026-09-07T15:00:00.000Z',
    bill_post_date: '2026-09-07',
    bill_forecast_date: '2026-09',
    bill_id: '01a0870d-d00e-7217-a177-dc77827a5b7e',
    payment_type: 'A_VISTA',
    charge_identificator: null,
    charge_number: null,
    payee_mcc: 5411,
    counterparty: null,
    category_ref: null,
    ...over,
  }
}

function montar(paginas: unknown[][], existentes: Set<string>) {
  const updates: { set: any; externalId?: string }[] = []
  const queries: unknown[] = []
  let selects = 0
  const db: any = {
    update: () => {
      const u: any = { set: (s: any) => { u.s = s; return u } }
      u.where = (cond: any) => {
        const externalId = Array.isArray(cond) ? (cond[2] as string) : undefined
        updates.push({ set: u.s, externalId })
        const r: any = Promise.resolve(externalId && existentes.has(externalId) ? [{ id: 'x' }] : [])
        r.returning = () => r
        return r
      }
      return u
    },
    insert: () => { throw new Error('releitura não insere') },
    // 1ª consulta: dia de vencimento do cartão. Depois: linhas que podem
    // ser órfãs de reemissão (nenhuma aqui; ver reemitidos.test.ts).
    select: () => {
      const resultado = selects++ === 0 ? [{ dueDay: 15 }] : []
      const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r) }
      for (const m of ['from', 'where', 'limit']) c[m] = () => c
      return c
    },
  }
  const client: any = {
    async *streamCardTransactions(_id: string, q: unknown) { queries.push(q); for (const p of paginas) yield p },
    async *streamAccountTransactions(_id: string, q: unknown) { queries.push(q); for (const p of paginas) yield p },
  }
  return { db, client, updates, queries }
}

const recurso = {
  id: 'recurso',
  polpResourceId: 'cartao',
  resourceType: 'CREDIT_CARD_ACCOUNT',
  syncFromDate: null as string | null,
  lastSyncedAt: new Date('2026-10-13T00:00:00Z'),
  syncVersion: 0,
}

describe('precisaReler', () => {
  it('relê o recurso lido por um sync de versão anterior', () => {
    expect(precisaReler({ lastSyncedAt: new Date(), syncVersion: VERSAO_DO_SYNC - 1 })).toBe(true)
  })
  it('não relê o que já está na versão atual', () => {
    expect(precisaReler({ lastSyncedAt: new Date(), syncVersion: VERSAO_DO_SYNC })).toBe(false)
  })
  it('não relê o recurso nunca sincronizado: a primeira passada já puxa tudo', () => {
    expect(precisaReler({ lastSyncedAt: null, syncVersion: 0 })).toBe(false)
  })
})

describe('refazAbertura', () => {
  // A versão 7 refaz uma vez o saldo de abertura que a 6 gravou com o extrato
  // atrasado; daí em diante o valor fica.
  it('refaz no recurso lido antes da versão 7', () => {
    expect(refazAbertura(6)).toBe(true)
  })
  it('não refaz nas releituras seguintes', () => {
    expect(refazAbertura(7)).toBe(false)
    expect(refazAbertura(8)).toBe(false)
  })
})

describe('relerHistorico', () => {
  it('grava o bill_id nas linhas existentes e sobe a versão do recurso', async () => {
    const { db, client, updates } = montar([[polpTx({ id: '01a0870d-aaaa' })]], new Set(['01a0870d-aaaa']))

    const n = await relerHistorico(db, client, 'org', 'conta', recurso)

    expect(n).toBe(1)
    expect(updates[0].set.billId).toBe('01a0870d-d00e-7217-a177-dc77827a5b7e')
    expect(updates.at(-1)!.set.syncVersion).toBe(VERSAO_DO_SYNC)
  })

  it('não mexe em valor, data, tipo nem saldo', async () => {
    const { db, client, updates } = montar([[polpTx()]], new Set(['01a0870d-aaaa']))

    await relerHistorico(db, client, 'org', 'conta', recurso)

    for (const campo of ['amountCents', 'date', 'type', 'balanceApplied', 'categoryId']) {
      expect(updates[0].set).not.toHaveProperty(campo)
    }
  })

  it('o que a Polp manda e não está no banco não entra', async () => {
    const { db, client } = montar([[polpTx({ id: '01a0870d-apagada' })]], new Set())

    expect(await relerHistorico(db, client, 'org', 'conta', recurso)).toBe(0)
  })

  it('respeita o corte da primeira sincronização', async () => {
    const { db, client, queries } = montar([[]], new Set())

    await relerHistorico(db, client, 'org', 'conta', { ...recurso, syncFromDate: '2026-08-01' })

    expect(queries[0]).toEqual({ fromDate: '2026-08-01T00:00:00Z' })
  })

  it('item que não normaliza fica de fora sem derrubar a releitura', async () => {
    const { db, client } = montar([[{ lixo: true }, polpTx()]], new Set(['01a0870d-aaaa']))

    expect(await relerHistorico(db, client, 'org', 'conta', recurso)).toBe(1)
  })
})

describe('parcela que chega sem data, só com o bill_id', () => {
  // Airbnb 3/6: bill_post_date igual à compra (falsa) e sem mês previsto.
  const airbnb = polpTx({
    id: '01a0870d-airbnb',
    transaction_name: 'AIRBNB * HMR5PP9B903/06',
    transaction_date_time: '2026-07-27T16:12:30.000Z',
    bill_post_date: '2026-07-27',
    bill_forecast_date: null,
    bill_id: '01a13333-b1c6-738a-a903-410d2753f7b7',
    payment_type: 'A_PRAZO',
    charge_identificator: 3,
    charge_number: 6,
  })
  const meses = new Map([['01a13333-b1c6-738a-a903-410d2753f7b7', '2026-10']])

  it('vai para o vencimento da fatura do bill_id, não para o dia da compra', async () => {
    corrigir.mockClear()
    const { db, client, updates } = montar([[airbnb]], new Set(['01a0870d-airbnb']))

    await relerHistorico(db, client, 'org', 'conta', recurso, meses)

    expect(updates[0].set.billForecastMonth).toBe('2026-10')
    expect(corrigir).toHaveBeenCalledWith(db, expect.objectContaining({ transactionId: 'x', dataFinal: '2026-10-15' }))
  })

  it('sem a fatura na Polp, a data fica como está', async () => {
    corrigir.mockClear()
    const { db, client, updates } = montar([[airbnb]], new Set(['01a0870d-airbnb']))

    await relerHistorico(db, client, 'org', 'conta', recurso, new Map())

    expect(updates[0].set.billForecastMonth).toBeNull()
    // A data gravada pode ser a da previsão ocupada: a da compra não a troca.
    expect(updates[0].set).not.toHaveProperty('date')
    expect(corrigir).not.toHaveBeenCalled()
  })

  it('compra à vista não tem a data mexida', async () => {
    const { db, client, updates } = montar([[polpTx()]], new Set(['01a0870d-aaaa']))

    await relerHistorico(db, client, 'org', 'conta', recurso, meses)

    expect(updates[0].set).not.toHaveProperty('date')
  })
})
