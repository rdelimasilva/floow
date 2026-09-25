import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

const ORG = 'org-1'
const CP = '11111111-1111-1111-1111-111111111111'
const L1 = '22222222-2222-2222-2222-222222222222'
const ITAU = '33333333-3333-3333-3333-333333333333'
const XP = '44444444-4444-4444-4444-444444444444'
const CORRETORA = '55555555-5555-5555-5555-555555555555'
const CAT = '66666666-6666-6666-6666-666666666666'
const R1 = '77777777-7777-7777-7777-777777777777'

const dialect = new PgDialect()
const renderizar = (cond: SQL | undefined) => dialect.sqlToQuery(cond!)

// Op guarda a escrita/leitura na ordem em que aconteceu — a mesma forma de
// `_fake-tx.ts` e de `counterparty-actions-par.test.ts`, com `delete` a mais.
interface Op { op: 'select' | 'update' | 'insert' | 'delete'; table: string; set?: Record<string, unknown>; where?: SQL }
const ops: Op[] = []
const selectQueue: unknown[][] = []

function makeChain(result: unknown[], op?: Op): any {
  const chain: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    catch: () => chain,
    finally: () => chain,
  }
  for (const m of ['from', 'limit', 'innerJoin', 'onConflictDoNothing']) chain[m] = () => makeChain(result, op)
  // Insert sempre "acha" a linha: o que estas provas medem é a sequência de
  // escritas e os deltas de saldo, não o id de retorno.
  chain.returning = () => makeChain(op?.op === 'insert' ? [{ id: 'perna-nova' }] : result, op)
  chain.set = (payload: Record<string, unknown>) => {
    if (op) op.set = payload
    return makeChain(result, op)
  }
  chain.where = (cond: SQL) => {
    if (op) op.where = cond
    return makeChain(result, op)
  }
  return chain
}

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

vi.mock('@/lib/finance/queries', () => ({ getOrgId: vi.fn(async () => ORG) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getClaims: vi.fn(async () => ({
        data: { claims: { sub: 'user-1', app_metadata: { org_ids: [ORG] } } },
        error: null,
      })),
    },
  })),
}))

const criarPropostas = vi.fn(async (..._args: unknown[]) => 0)
vi.mock('@/lib/finance/forecast-match-db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/finance/forecast-match-db')>('@/lib/finance/forecast-match-db')
  return {
    ...actual,
    criarPropostasDeConciliacao: (...args: Parameters<typeof actual.criarPropostasDeConciliacao>) => criarPropostas(...args),
  }
})

vi.mock('@/lib/openfinance/cpf-proprio', () => ({
  carregarHashesDoTitular: vi.fn(async () => new Set(['h'])),
  ehCpfProprio: vi.fn((taxId: string) => taxId === 'CPF-DO-TITULAR'),
}))
vi.mock('@/lib/finance/account-actions', () => ({ assertAccountOwnership: vi.fn(async () => {}) }))
vi.mock('@/lib/openfinance/transfer-leg', async () => {
  const actual = await vi.importActual<typeof import('@/lib/openfinance/transfer-leg')>('@/lib/openfinance/transfer-leg')
  return { ...actual, isOpenFinanceLinkedAccount: vi.fn(async () => false) }
})

function fakeSelect() {
  const op: Op = { op: 'select', table: '' }
  ops.push(op)
  return { from: (table: any) => { op.table = getTableName(table); return makeChain(selectQueue.shift() ?? [], op) } }
}

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return {
    ...actual,
    getDb: () => ({
      transaction: async (fn: (tx: unknown) => unknown) => fn({
        select: fakeSelect,
        update: (table: any) => {
          const op: Op = { op: 'update', table: getTableName(table) }
          ops.push(op)
          return makeChain([], op)
        },
        insert: (table: any) => {
          const op: Op = { op: 'insert', table: getTableName(table) }
          ops.push(op)
          return { values: () => makeChain([], op) }
        },
        delete: (table: any) => {
          const op: Op = { op: 'delete', table: getTableName(table) }
          ops.push(op)
          return makeChain([], op)
        },
      }),
      // `previaCorrecaoDeRegra` só lê, fora de transação; consome a mesma
      // fila de selects que o `tx` de dentro de `corrigirRegra`.
      select: fakeSelect,
    }),
  }
})

import { corrigirRegra, previaCorrecaoDeRegra } from '@/lib/openfinance/corrigir-regra-actions'

const REGRA = {
  id: CP,
  nature: 'transfer' as const,
  categoryId: null,
  transferAccountId: XP,
  keyType: 'description' as const,
  keyValue: 'RESGATE CDB DI',
  // Regra por descrição vale numa conta só: a do extrato onde o texto aparece.
  accountId: ITAU,
  confirmedAt: new Date(),
}

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
  criarPropostas.mockClear()
})

describe('corrigirRegra', () => {
  it('só daqui pra frente: atualiza a regra e não toca em lançamento', async () => {
    selectQueue.push([REGRA])

    const r = await corrigirRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: CORRETORA, aplicarAoHistorico: false })

    expect(r).toEqual({ reprocessados: 0, ignorados: 0 })
    expect(ops.filter((o) => o.op !== 'select').map((o) => o.table)).toEqual(['counterparties'])
    expect(ops.find((o) => o.op === 'update' && o.table === 'counterparties')!.set).toMatchObject({ transferAccountId: CORRETORA })
  })

  it('com histórico: desfaz o par antigo e reaplica com a conta nova', async () => {
    selectQueue.push(
      [REGRA], // a regra
      [{ id: L1, accountId: ITAU, amountCents: 400100, description: 'Resgate CDB DI', transferGroupId: 'g1', balanceApplied: true }], // selecionar
      [{ id: 'p1', accountId: XP, amountCents: -400100, externalId: 'e:transfer-dest', balanceApplied: true, isIgnored: false, matchedTransactionId: null }], // pernas
      [{ id: L1 }], // lote de pendentes
      [{ id: L1, accountId: ITAU, amountCents: 400100, date: '2026-07-08', externalId: 'e', balanceApplied: true }], // applyTransferSingle
    )

    const r = await corrigirRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: CORRETORA, aplicarAoHistorico: true })

    expect(r).toEqual({ reprocessados: 1, ignorados: 0 })
    const escritas = ops.filter((o) => o.op !== 'select').map((o) => `${o.op}:${o.table}`)
    expect(escritas).toEqual([
      'update:accounts', // estorno XP
      'delete:transactions', // perna antiga
      'update:transactions', // L1 → pending
      'update:counterparties', // regra nova
      'update:transactions', // L1 → transfer confirmado
      'insert:transactions', // perna nova :transfer-dest
      'update:accounts', // saldo Corretora
    ])
  })

  it('CPF próprio com histórico: regra fica sem conta e os lançamentos voltam para Classificar', async () => {
    selectQueue.push(
      [{ ...REGRA, keyType: 'tax_id', keyValue: 'CPF-DO-TITULAR' }],
      [{ id: L1, accountId: ITAU, amountCents: 9552, description: 'Pix recebido', transferGroupId: 'g1', balanceApplied: true }],
      [{ id: 'p1', accountId: XP, amountCents: -9552, externalId: 'e:transfer-dest', balanceApplied: true, isIgnored: false, matchedTransactionId: null }],
    )

    const r = await corrigirRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: null, aplicarAoHistorico: true })

    expect(r.reprocessados).toBe(1)
    expect(ops.find((o) => o.op === 'update' && o.table === 'counterparties')!.set).toMatchObject({ nature: null, categoryId: null, transferAccountId: null, confirmedAt: null, confirmedBy: null })
    expect(ops.some((o) => o.op === 'insert')).toBe(false)
  })

  it('par do outro lado conta como ignorado e não é desfeito', async () => {
    selectQueue.push(
      [REGRA],
      [{ id: L1, accountId: ITAU, amountCents: 100, description: 'x', transferGroupId: null, balanceApplied: true }],
      [{ id: 'perna-de-la', externalId: 'e:transfer-par' }], // matched_transaction_id = L1
      [], // lote: L1 não está pendente
    )

    const r = await corrigirRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: CORRETORA, aplicarAoHistorico: true })

    expect(r).toEqual({ reprocessados: 0, ignorados: 1 })
  })

  it('regra de outra org ou não confirmada: recusa', async () => {
    selectQueue.push([])

    await expect(
      corrigirRegra({ counterpartyId: CP, nature: 'expense', categoryId: CAT, transferAccountId: null, aplicarAoHistorico: false }),
    ).rejects.toThrow('Regra não encontrada.')
  })
})

describe('previaCorrecaoDeRegra', () => {
  it('mesma conta, lançamento sem par: nada a estornar, só a perna nova sai de XP', async () => {
    selectQueue.push([REGRA], [{ id: L1, accountId: ITAU, amountCents: 100, description: 'x', transferGroupId: null, balanceApplied: true, isIgnored: false }], [], [])

    const p = await previaCorrecaoDeRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: XP })

    // Sem grupo não há estorno; a perna nova em XP debita −100. O caso com
    // grupo (+100 de estorno, −100 da perna nova) é coberto por somarPrevia.
    expect(p).toEqual({ mudam: 1, foraPorParDoOutroLado: [], deltas: { [XP]: -100 }, naContaNova: 0 })
  })
})

/**
 * Deltas de saldo que a action gravou, por conta. `balance_cents + ${delta}`
 * guarda o número em `queryChunks`; a conta sai do `where` renderizado.
 */
function deltasGravados(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const o of ops) {
    if (o.op !== 'update' || o.table !== 'accounts') continue
    const conta = renderizar(o.where).params[0] as string
    const valor = (o.set!.balanceCents as SQL).queryChunks.find((c): c is number => typeof c === 'number')!
    out[conta] = (out[conta] ?? 0) + valor
    if (out[conta] === 0) delete out[conta]
  }
  return out
}

/** Caso real: resgates do CDB do Itaú confirmados como transferência vinda da XP. */
function fixtureXp(valores: number[]) {
  const linhas = valores.map((v, i) => ({ id: `l${i}`, accountId: ITAU, amountCents: v, description: 'Resgate CDB DI', transferGroupId: `g${i}`, balanceApplied: true, isIgnored: false }))
  const pernas = valores.map((v, i) => [{ id: `p${i}`, accountId: XP, amountCents: -v, externalId: `e${i}:transfer-dest`, balanceApplied: true, isIgnored: false, matchedTransactionId: null }])
  const previa = [[REGRA], linhas, ...pernas]
  const action = [
    [REGRA],
    linhas,
    ...pernas,
    linhas.map((l) => ({ id: l.id })), // lote de pendentes
    ...linhas.map((l, i) => [{ id: l.id, accountId: ITAU, amountCents: l.amountCents, date: '2026-07-08', externalId: `e${i}`, balanceApplied: true, isIgnored: false }]),
  ]
  return { previa, action }
}

describe('prévia e action no mesmo fixture (spec §9)', () => {
  it('os deltas da prévia são os que a action grava em accounts', async () => {
    const f = fixtureXp([400100, 20084])

    selectQueue.push(...f.previa)
    const p = await previaCorrecaoDeRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: CORRETORA })
    ops.length = 0
    selectQueue.length = 0

    selectQueue.push(...f.action)
    const r = await corrigirRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: CORRETORA, aplicarAoHistorico: true })

    expect(p.deltas).toEqual({ [XP]: 420184, [CORRETORA]: -420184 })
    expect(deltasGravados()).toEqual(p.deltas)
    expect(r.reprocessados).toBe(p.mudam)
  })

  it('caso real XP: corrigir com histórico para outra conta manual zera o saldo que a regra criou na XP', async () => {
    const valores = [400100, 20084, 1500000]
    const saldoXp = -valores.reduce((a, b) => a + b, 0)

    selectQueue.push(...fixtureXp(valores).action)
    await corrigirRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: CORRETORA, aplicarAoHistorico: true })

    const d = deltasGravados()
    expect(d[XP]).toBe(valores.reduce((a, b) => a + b, 0))
    expect(saldoXp + d[XP]).toBe(0)
    expect(d[CORRETORA]).toBe(saldoXp)
  })
})

describe('corrigirRegra — reaplica só o que desfez (achado 1)', () => {
  it('transferência: o lote de reaplicação fica restrito aos ids desfeitos', async () => {
    selectQueue.push(
      [REGRA],
      [{ id: L1, accountId: ITAU, amountCents: 400100, description: 'Resgate CDB DI', transferGroupId: 'g1', balanceApplied: true, isIgnored: false }],
      [{ id: 'p1', accountId: XP, amountCents: -400100, externalId: 'e:transfer-dest', balanceApplied: true, isIgnored: false, matchedTransactionId: null }],
      [{ id: L1 }],
      [{ id: L1, accountId: ITAU, amountCents: 400100, date: '2026-07-08', externalId: 'e', balanceApplied: true, isIgnored: false }],
    )

    await corrigirRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: CORRETORA, aplicarAoHistorico: true })

    // selects: regra, selecionar, pernas, LOTE, applyTransferSingle
    const lote = ops.filter((o) => o.op === 'select')[3]
    const q = renderizar(lote.where)
    // Pendente que já estava em Classificar (Nível 1, destino = própria conta)
    // não foi desfeito aqui e não pode ser reclassificado por trás da prévia.
    expect(q.sql).toContain('"transactions"."id" in (')
    expect(q.params).toContain(L1)
  })

  it('receita/despesa: o update em lote fica restrito aos desfeitos, sem o realizado devolvido', async () => {
    selectQueue.push(
      [REGRA],
      [{ id: L1, accountId: ITAU, amountCents: 400100, description: 'Resgate CDB DI', transferGroupId: 'g1', balanceApplied: true, isIgnored: false }],
      [{ id: 'p1', accountId: XP, amountCents: -400100, externalId: 'e:transfer-par', balanceApplied: false, isIgnored: false, matchedTransactionId: R1 }],
    )

    await corrigirRegra({ counterpartyId: CP, nature: 'income', categoryId: CAT, transferAccountId: null, aplicarAoHistorico: true })

    const lote = ops.find((o) => o.op === 'update' && o.table === 'transactions' && o.set?.type === 'income')!
    const q = renderizar(lote.where)
    expect(q.sql).toContain('"transactions"."id" in (')
    expect(q.params).toContain(L1)
    // O realizado do outro banco voltou a pendente como transferência sem
    // conta: é para Classificar, não para esta regra.
    expect(q.params).not.toContain(R1)
  })

  it('nada desfeito (só par do outro lado): não roda lote nenhum', async () => {
    selectQueue.push(
      [REGRA],
      [{ id: L1, accountId: ITAU, amountCents: 100, description: 'x', transferGroupId: null, balanceApplied: true, isIgnored: false }],
      [{ id: 'perna-de-la', externalId: 'e:transfer-par' }],
    )

    await corrigirRegra({ counterpartyId: CP, nature: 'income', categoryId: CAT, transferAccountId: null, aplicarAoHistorico: true })

    expect(ops.some((o) => o.op === 'update' && o.table === 'transactions')).toBe(false)
  })
})

describe('corrigirRegra — mesma conta (achado 4)', () => {
  it('regra por descrição: recusa destino = conta onde a regra vale, antes de gravar', async () => {
    selectQueue.push([REGRA])

    await expect(
      corrigirRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: ITAU, aplicarAoHistorico: false }),
    ).rejects.toThrow('Esta regra vale para os lançamentos da própria conta escolhida. Escolha outra conta para a transferência.')
    expect(ops.filter((o) => o.op !== 'select')).toEqual([])
  })

  it('com histórico: recusa quando há lançamento selecionado na conta nova, antes de gravar', async () => {
    selectQueue.push(
      [{ ...REGRA, keyType: 'tax_id', keyValue: '12345678000199', accountId: null }],
      [
        { id: L1, accountId: ITAU, amountCents: 100, description: 'x', transferGroupId: null, balanceApplied: true, isIgnored: false },
        { id: 'l2', accountId: CORRETORA, amountCents: 200, description: 'y', transferGroupId: null, balanceApplied: true, isIgnored: false },
      ],
    )

    await expect(
      corrigirRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: CORRETORA, aplicarAoHistorico: true }),
    ).rejects.toThrow('1 lançamento desta regra está na própria conta escolhida. Escolha outra conta para a transferência.')
    expect(ops.filter((o) => o.op !== 'select')).toEqual([])
  })

  it('prévia conta os selecionados que já estão na conta nova', async () => {
    selectQueue.push(
      [{ ...REGRA, keyType: 'tax_id', keyValue: '12345678000199', accountId: null }],
      [
        { id: L1, accountId: ITAU, amountCents: 100, description: 'x', transferGroupId: null, balanceApplied: true, isIgnored: false },
        { id: 'l2', accountId: CORRETORA, amountCents: 200, description: 'y', transferGroupId: null, balanceApplied: true, isIgnored: false },
      ],
      [], [], [], [],
    )

    const p = await previaCorrecaoDeRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: CORRETORA })

    expect(p.naContaNova).toBe(1)
  })
})
