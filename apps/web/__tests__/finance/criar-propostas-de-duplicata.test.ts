import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Quem leva o sinal do detector ate a fila.
 *
 * O detector e puro e ja foi validado contra os dados reais (3 de 3 pares
 * verdadeiros, 0 falsos positivos em 1027 lancamentos). O que falta provar
 * aqui e o contorno: agrupar por (data, valor) antes de comparar, e contar
 * como criada so a proposta que o banco aceitou — `onConflictDoNothing`
 * devolve vazio para o par ja recusado, e contar esse par faria o sync
 * anunciar fila que nao existe.
 */

const inseridos: Array<Record<string, unknown>> = []
let candidatos: unknown[] = []
/** Cada posicao diz o que o insert daquela chamada devolve. */
let respostaDoInsert: unknown[][] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'returning', 'onConflictDoNothing']) c[m] = () => chain(result)
  return c
}

const db = {
  select: () => chain(candidatos),
  insert: () => ({
    values: (v: Record<string, unknown>) => {
      inseridos.push(v)
      return chain(respostaDoInsert.shift() ?? [{ id: 'nova' }])
    },
  }),
}

vi.mock('@floow/db', () => ({
  getDb: () => db,
  transactions: {
    _: { name: 'transactions' },
    id: 'id', orgId: 'org_id', accountId: 'account_id', date: 'date',
    amountCents: 'amount_cents', installmentNumber: 'installment_number',
    counterpartyTaxId: 'counterparty_tax_id', externalId: 'external_id', isIgnored: 'is_ignored',
  },
  duplicateProposals: { _: { name: 'duplicate_proposals' }, id: 'id' },
}))

const { criarPropostasDeDuplicata } = await import('@/lib/finance/duplicata-db')

/** UUIDv7 com o instante pedido — e ele que o detector le. */
function uuidV7Em(iso: string): string {
  const ms = new Date(iso).getTime().toString(16).padStart(12, '0')
  return `${ms.slice(0, 8)}-${ms.slice(8, 12)}-7000-8000-000000000000`
}

const EM_16_09 = new Date('2026-09-16T00:00:00Z')

beforeEach(() => {
  inseridos.length = 0
  respostaDoInsert = []
  candidatos = []
})

describe('criarPropostasDeDuplicata', () => {
  it('propõe o par reemitido horas depois', async () => {
    candidatos = [
      { id: 'a', date: EM_16_09, amountCents: -1168540, installmentNumber: null, counterpartyTaxId: null, externalId: uuidV7Em('2026-09-16T03:00:00Z') },
      { id: 'b', date: EM_16_09, amountCents: -1168540, installmentNumber: null, counterpartyTaxId: null, externalId: uuidV7Em('2026-09-16T06:04:00Z') },
    ]

    const criadas = await criarPropostasDeDuplicata(db as never, 'org-1', 'acc-1')

    expect(criadas).toBe(1)
    expect(inseridos).toHaveLength(1)
    expect(inseridos[0].manterTransactionId).toBe('a')
    expect(inseridos[0].duplicataTransactionId).toBe('b')
    expect(inseridos[0].minutosEntreEmissoes).toBe(184)
    expect(inseridos[0].status).toBe('pending')
  })

  it('não cruza lançamentos de datas ou valores diferentes', async () => {
    // Sem o agrupamento, o detector receberia a conta inteira de uma vez e
    // compararia linhas que nunca poderiam formar par.
    candidatos = [
      { id: 'a', date: EM_16_09, amountCents: -1168540, installmentNumber: null, counterpartyTaxId: null, externalId: uuidV7Em('2026-09-16T03:00:00Z') },
      { id: 'b', date: new Date('2026-09-17T00:00:00Z'), amountCents: -1168540, installmentNumber: null, counterpartyTaxId: null, externalId: uuidV7Em('2026-09-16T06:04:00Z') },
      { id: 'c', date: EM_16_09, amountCents: -25655, installmentNumber: null, counterpartyTaxId: null, externalId: uuidV7Em('2026-09-16T09:00:00Z') },
    ]

    const criadas = await criarPropostasDeDuplicata(db as never, 'org-1', 'acc-1')

    expect(criadas).toBe(0)
    expect(inseridos).toHaveLength(0)
  })

  it('não conta o par que o banco recusou por já ter sido decidido', async () => {
    // `uq_dp_par` + ON CONFLICT DO NOTHING: a recusa anterior é uma parede, e
    // o insert volta vazio.
    candidatos = [
      { id: 'a', date: EM_16_09, amountCents: -1168540, installmentNumber: null, counterpartyTaxId: null, externalId: uuidV7Em('2026-09-16T03:00:00Z') },
      { id: 'b', date: EM_16_09, amountCents: -1168540, installmentNumber: null, counterpartyTaxId: null, externalId: uuidV7Em('2026-09-16T06:04:00Z') },
    ]
    respostaDoInsert = [[]]

    const criadas = await criarPropostasDeDuplicata(db as never, 'org-1', 'acc-1')

    expect(criadas).toBe(0)
  })

  it('não propõe nada quando não há candidato nenhum', async () => {
    candidatos = []

    const criadas = await criarPropostasDeDuplicata(db as never, 'org-1', 'acc-1')

    expect(criadas).toBe(0)
    expect(inseridos).toHaveLength(0)
  })
})
