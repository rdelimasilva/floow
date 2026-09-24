import { beforeEach, describe, expect, it } from 'vitest'
import { persistPage } from '@/lib/openfinance/persist-page'
import type { ResolvedTransaction } from '@/lib/openfinance/resolve-counterparty'

/**
 * A decisão de perna em `persistPage` para transferência confirmada vinda do
 * banco. Mock de fila: cada `select` consome uma resposta, cada `insert`
 * guarda o que recebeu. Sem `purchaseDate`, o caminho de parcelas não roda.
 */

const selectQueue: unknown[][] = []
const inserts: any[][] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'set', 'onConflictDoNothing', 'returning']) c[m] = () => c
  return c
}

const db: any = {
  select: () => chain(selectQueue.shift() ?? []),
  update: () => chain([]),
  insert: () => ({
    values: (v: any[]) => {
      inserts.push(v)
      return chain(v.map((row) => ({ id: 'novo', accountId: row.accountId, amountCents: row.amountCents, applied: row.balanceApplied })))
    },
  }),
  transaction: async (fn: (t: unknown) => unknown) => fn(db),
}

function linha(over: Partial<ResolvedTransaction> = {}): ResolvedTransaction {
  return {
    externalId: 'ext-1',
    date: '2026-09-10',
    amountCents: 50000,
    type: 'transfer',
    natureConfirmed: false,
    counterpartyTaxId: '12345678000199',
    counterpartyName: 'EU MESMO',
    description: 'PIX RECEBIDO',
    categoryRef: null,
    polpType: null,
    payeeMcc: null,
    billPostDate: null,
    billForecastMonth: null,
    installmentNumber: null,
    installmentTotal: null,
    purchaseDate: null,
    settlement: 'settled',
    foreign: null,
    reviewState: 'confirmed',
    counterpartyId: 'cp-1',
    categoryId: null,
    transferAccountId: 'itau',
    ...over,
  } as ResolvedTransaction
}

const input = (normalized: ResolvedTransaction[]) => ({
  orgId: 'org-1', accountId: 'nubank', normalized, categoryByRef: new Map<string, string>(), rules: [],
})

beforeEach(() => {
  selectQueue.length = 0
  inserts.length = 0
})

describe('persistPage — transferência para conta Open Finance', () => {
  it('sem perna do outro lado: cria a perna prevista e devolve a conta para propor', async () => {
    selectQueue.push([]) // existentes
    selectQueue.push([{ id: 'recurso-itau' }]) // isOpenFinanceLinkedAccount: linked
    selectQueue.push([]) // acharPernaPrevistaAberta: nada

    const r = await persistPage(db, input([linha()]))

    expect(inserts).toHaveLength(2)
    expect(inserts[1][0]).toMatchObject({ accountId: 'itau', externalId: 'ext-1:transfer-par', balanceApplied: false })
    expect(r.contasComPernaPrevista).toEqual(['itau'])
  })

  it('OF↔OF: o outro lado já criou a perna prevista aqui — não cria segunda, a linha fica sem grupo', async () => {
    selectQueue.push([]) // existentes
    selectQueue.push([{ id: 'recurso-itau' }]) // linked
    selectQueue.push([{ id: 'perna-do-itau' }]) // acharPernaPrevistaAberta: achou

    const r = await persistPage(db, input([linha()]))

    expect(inserts).toHaveLength(1) // só a própria linha
    expect(inserts[0][0]).toMatchObject({
      type: 'transfer', reviewState: 'confirmed', transferAccountId: 'itau', transferGroupId: null,
    })
    // A conciliação que casa o par é a desta conta, que o sync já roda.
    expect(r.contasComPernaPrevista).toEqual([])
  })
})
