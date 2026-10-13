import { beforeEach, describe, expect, it } from 'vitest'
import { persistPage } from '@/lib/openfinance/persist-page'
import type { ResolvedTransaction } from '@/lib/openfinance/resolve-counterparty'

/**
 * Fechamento de fatura com id novo (Visa PDA, 13/10): o Facebook de R$ 12,64
 * de 12/09, que estava na fatura aberta desde 19/09, voltou com outro
 * `external_id` dentro da fatura fechada e entrou de novo. Agora ocupa a
 * linha que já existia. A SQL da busca foi conferida no banco real, com
 * rollback; aqui fica a decisão de `persistPage`.
 */

const selectQueue: unknown[][] = []
const updateResults: unknown[][] = []
const inserts: any[][] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'set', 'onConflictDoNothing', 'returning']) c[m] = () => c
  return c
}

const db: any = {
  select: () => chain(selectQueue.shift() ?? []),
  update: () => chain(updateResults.shift() ?? []),
  insert: () => ({
    values: (v: any[]) => {
      inserts.push(v)
      return chain(v.map((row) => ({ id: 'novo', amountCents: row.amountCents, applied: row.balanceApplied })))
    },
  }),
  transaction: async (fn: (t: unknown) => unknown) => fn(db),
}

function facebook(over: Partial<ResolvedTransaction> = {}): ResolvedTransaction {
  return {
    externalId: '01a13333-bab6-7296-b0a9-3dd32e635c32',
    date: '2026-09-12',
    amountCents: -1264,
    type: 'expense',
    natureConfirmed: false,
    counterpartyTaxId: '22576788000111',
    counterpartyName: 'Facebook',
    description: 'Facebook',
    categoryRef: null,
    polpType: null,
    payeeMcc: 7311,
    billPostDate: '2026-09-13',
    billForecastMonth: null,
    billId: '01a13333-b619-735b-855d-3c6b14991beb',
    installmentNumber: null,
    installmentTotal: null,
    purchaseDate: null,
    settlement: 'settled',
    foreign: null,
    reviewState: 'confirmed',
    counterpartyId: null,
    categoryId: null,
    transferAccountId: null,
    ...over,
  } as ResolvedTransaction
}

const input = (normalized: ResolvedTransaction[]) => ({
  orgId: 'org-1', accountId: 'visa-pda', normalized, categoryByRef: new Map<string, string>(), rules: [],
})

beforeEach(() => {
  selectQueue.length = 0
  updateResults.length = 0
  inserts.length = 0
})

describe('persistPage — lançamento que volta na fatura fechada com id novo', () => {
  it('ocupa a linha da fatura aberta em vez de inserir de novo', async () => {
    selectQueue.push([]) // existentes por external_id: nenhum, o id é novo
    updateResults.push([{ id: 'original-19-09' }]) // ocuparNaFaturaFechada achou a linha

    const r = await persistPage(db, input([facebook()]))

    expect(inserts).toHaveLength(0)
    expect(r).toMatchObject({ imported: 0, updated: 1 })
  })

  it('sem linha na fatura aberta, entra normal', async () => {
    selectQueue.push([])
    updateResults.push([]) // nada para ocupar: compra que já chegou na fatura fechada

    await persistPage(db, input([facebook()]))

    expect(inserts).toHaveLength(1)
    expect(inserts[0][0]).toMatchObject({ externalId: '01a13333-bab6-7296-b0a9-3dd32e635c32', billId: '01a13333-b619-735b-855d-3c6b14991beb' })
  })

  it('fatura aberta (sem bill_id) nunca tenta ocupar', async () => {
    selectQueue.push([])
    updateResults.push([{ id: 'nao-deveria' }])

    await persistPage(db, input([facebook({ billId: null, billPostDate: null, billForecastMonth: '2026-10' })]))

    expect(inserts).toHaveLength(1)
  })
})
