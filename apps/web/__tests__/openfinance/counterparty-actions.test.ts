import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

const ORG = 'org-1'
const COUNTERPARTY_ID = '11111111-1111-1111-1111-111111111111'
const CATEGORY_ID = '22222222-2222-2222-2222-222222222222'
const TX2_ID = '33333333-3333-3333-3333-333333333333'
const TRANSFER_ACCOUNT_ID = '44444444-4444-4444-4444-444444444444'

// `where` guarda a condição que recebeu: o resto do mock descarta os
// argumentos, e filtro de lote só se prova renderizando o SQL de verdade.
interface Op { op: 'select' | 'update' | 'insert'; table: string; where?: unknown }
const ops: Op[] = []
const selectQueue: unknown[][] = []
const updateQueue: unknown[][] = []

function makeChain(result: unknown[], op?: Op): any {
  const chain: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    catch: () => chain,
    finally: () => chain,
  }
  for (const m of ['from', 'limit', 'set', 'returning', 'onConflictDoNothing']) chain[m] = () => makeChain(result, op)
  chain.where = (cond: unknown) => {
    if (op) op.where = cond
    return makeChain(result, op)
  }
  return chain
}

// `revalidateTransactionData`/`revalidateSnapshotData`/`invalidateTag` chamam
// `revalidateTag` do Next por baixo, que fora de um request real lança
// "Invariant: static generation store missing" — mesmo mock de
// `__tests__/finance/actions.test.ts`, na mesma origem.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

vi.mock('@/lib/finance/queries', () => ({ getOrgId: vi.fn(async () => ORG) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      // getClaims é a única porta de identidade do app — getSession não é mais
      // consultado em lugar nenhum (ver lib/auth/session.ts).
      getClaims: vi.fn(async () => ({
        data: { claims: { sub: 'user-1', app_metadata: { org_ids: [ORG] } } },
        error: null,
      })),
    },
  })),
}))
const insertQueue: unknown[][] = []
const insertedValues: any[] = []

const criarPropostas = vi.fn(async (..._args: unknown[]) => 0)
vi.mock('@/lib/finance/forecast-match-db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/finance/forecast-match-db')>('@/lib/finance/forecast-match-db')
  return {
    ...actual,
    criarPropostasDeConciliacao: (...args: Parameters<typeof actual.criarPropostasDeConciliacao>) => criarPropostas(...args),
  }
})

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return {
    ...actual,
    getDb: () => ({
      transaction: async (fn: (tx: unknown) => unknown) => fn({
        select: (sel: any) => {
          const op: Op = { op: 'select', table: '' }
          ops.push(op)
          return { from: (table: any) => { op.table = getTableName(table); return makeChain(selectQueue.shift() ?? [], op) } }
        },
        update: (table: any) => {
          const op: Op = { op: 'update', table: getTableName(table) }
          ops.push(op)
          return makeChain(updateQueue.shift() ?? [], op)
        },
        insert: (table: any) => {
          ops.push({ op: 'insert', table: getTableName(table) })
          return { values: (v: any) => { insertedValues.push(v); return makeChain(insertQueue.shift() ?? []) } }
        },
      }),
      // `criarPropostasDeConciliacao` roda fora da transação, depois do
      // commit — o mock precisa de um `select` de nível de módulo também.
      select: () => ({ from: () => makeChain([]) }),
    }),
  }
})

import { confirmCounterparty } from '@/lib/openfinance/counterparty-actions'

const dialect = new PgDialect()
function sqlDoWhere(op: Op | undefined): string {
  if (!op?.where) throw new Error('operação sem where')
  return dialect.sqlToQuery(op.where as SQL).sql.toLowerCase()
}

/** Fila da transferência com destino manual, um lançamento pendente no lote. */
function filaTransferenciaManual() {
  selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
  selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership incondicional
  updateQueue.push([]) // update de counterparties
  selectQueue.push([{ id: 'tx-1' }]) // ids pendentes do grupo (applyTransferBatch)
  selectQueue.push([{
    id: 'tx-1', accountId: 'conta-origem', amountCents: -50000,
    date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: true,
  }])
  selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership
  selectQueue.push([]) // isOpenFinanceLinkedAccount: manual
  updateQueue.push([]) // update da origem
  insertQueue.push([{ id: 'tx-1-dest' }])
  updateQueue.push([]) // saldo do destino
  selectQueue.push([{ one: 1 }])
}

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
  updateQueue.length = 0
  insertQueue.length = 0
  insertedValues.length = 0
  criarPropostas.mockClear()
})

describe('confirmCounterparty', () => {
  it('rejeita categoria em transferência', async () => {
    await expect(
      confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID,
        nature: 'transfer',
        categoryId: CATEGORY_ID,
        transferAccountId: TRANSFER_ACCOUNT_ID,
      }),
    ).rejects.toThrow()
  })

  it('rejeita despesa sem categoria', async () => {
    await expect(
      confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'expense', categoryId: null, transferAccountId: null }),
    ).rejects.toThrow()
  })

  it('atualiza a contraparte e só as transações pendentes dela', async () => {
    selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
    updateQueue.push([]) // update de counterparties não retorna nada relevante
    updateQueue.push([{ id: 'tx-1' }, { id: 'tx-2' }]) // 2 transações reclassificadas
    selectQueue.push([{ one: 1 }]) // ainda sobra pendência resolvível na org — não destrava o portão

    const result = await confirmCounterparty({
      counterpartyId: COUNTERPARTY_ID,
      nature: 'expense',
      categoryId: CATEGORY_ID,
      transferAccountId: null,
    })

    expect(result.reclassified).toBe(2)
    expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions'])
  })

  it('contraparte de outra org não é encontrada', async () => {
    selectQueue.push([]) // nenhuma linha — a cerca de org bloqueou

    await expect(
      confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID,
        nature: 'transfer',
        categoryId: null,
        transferAccountId: TRANSFER_ACCOUNT_ID,
      }),
    ).rejects.toThrow(/não encontrada/)
  })

  it('zera a última pendência resolvível da org: grava reviewGateClearedAt em orgs', async () => {
    selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
    updateQueue.push([]) // update de counterparties
    updateQueue.push([{ id: 'tx-1' }]) // 1 transação reclassificada
    selectQueue.push([]) // nenhuma pendência resolvível restante na org
    updateQueue.push([]) // update de orgs.reviewGateClearedAt

    await confirmCounterparty({
      counterpartyId: COUNTERPARTY_ID,
      nature: 'expense',
      categoryId: CATEGORY_ID,
      transferAccountId: null,
    })

    expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions', 'orgs'])
  })

  it('ainda sobra pendência resolvível na org: não grava reviewGateClearedAt', async () => {
    selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
    updateQueue.push([]) // update de counterparties
    updateQueue.push([{ id: 'tx-1' }]) // 1 transação reclassificada
    selectQueue.push([{ one: 1 }]) // ainda sobra pendência resolvível na org

    await confirmCounterparty({
      counterpartyId: COUNTERPARTY_ID,
      nature: 'expense',
      categoryId: CATEGORY_ID,
      transferAccountId: null,
    })

    expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions'])
  })

  it('aplica exceção a um lançamento específico, sem virar regra da contraparte', async () => {
    selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
    updateQueue.push([]) // update de counterparties (regra do grupo)
    updateQueue.push([{ id: 'tx-1' }]) // lote, excluindo a exceção
    updateQueue.push([{ id: 'tx-2' }]) // update da exceção (tx-2)
    selectQueue.push([{ one: 1 }]) // ainda sobra pendência resolvível na org

    const result = await confirmCounterparty({
      counterpartyId: COUNTERPARTY_ID,
      nature: 'expense',
      categoryId: CATEGORY_ID,
      transferAccountId: null,
      // Nature diferente da do grupo (expense) só pra provar que a exceção
      // não segue o padrão — 'income', não 'transfer': com conta de destino
      // a exceção de transferência já tem cobertura própria, abaixo, com a
      // fila de mocks certa pro fork de `applyTransferSingle`.
      exceptions: [{ transactionId: TX2_ID, nature: 'income', categoryId: CATEGORY_ID, transferAccountId: null }],
    })

    expect(result.reclassified).toBe(2)
    expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual([
      'counterparties',
      'transactions',
      'transactions',
    ])
  })

  it('rejeita exceção de despesa sem categoria', async () => {
    // Fila completa: se a validação da exceção não bloquear, a chamada
    // sucede normalmente — só rejeita se o schema realmente checar a exceção.
    selectQueue.push([{ id: COUNTERPARTY_ID }])
    updateQueue.push([])
    updateQueue.push([{ id: 'tx-1' }])
    updateQueue.push([{ id: 'tx-2' }])
    selectQueue.push([{ one: 1 }])

    await expect(
      confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID,
        nature: 'transfer',
        categoryId: null,
        transferAccountId: TRANSFER_ACCOUNT_ID,
        exceptions: [{ transactionId: TX2_ID, nature: 'expense', categoryId: null, transferAccountId: null }],
      }),
    ).rejects.toThrow()
  })

  describe('transferência com conta de destino', () => {
    it('rejeita transferência sem transferAccountId', async () => {
      await expect(
        confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'transfer', categoryId: null, transferAccountId: null }),
      ).rejects.toThrow()
    })

    it('rejeita receita/despesa com transferAccountId preenchido', async () => {
      await expect(
        confirmCounterparty({
          counterpartyId: COUNTERPARTY_ID,
          nature: 'expense',
          categoryId: CATEGORY_ID,
          transferAccountId: TRANSFER_ACCOUNT_ID,
        }),
      ).rejects.toThrow()
    })

    it('destino é conta manual: cria a segunda perna e atualiza o saldo dela', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership incondicional em confirmCounterparty
      updateQueue.push([]) // update de counterparties
      selectQueue.push([{ id: 'tx-1' }]) // ids pendentes do grupo (applyTransferBatch)
      selectQueue.push([{ // lookup da transação de origem (applyTransferSingle)
        id: 'tx-1', accountId: 'conta-origem', amountCents: -50000,
        date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: true,
      }])
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership: conta pertence à org
      selectQueue.push([]) // isOpenFinanceLinkedAccount: sem recurso -> conta manual
      updateQueue.push([]) // update da linha de origem (transferAccountId, transferGroupId)
      insertQueue.push([{ id: 'tx-1-dest' }]) // insert da segunda perna
      updateQueue.push([]) // update do saldo da conta de destino
      selectQueue.push([{ one: 1 }]) // ainda sobra pendência resolvível na org

      const result = await confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID,
        nature: 'transfer',
        categoryId: null,
        transferAccountId: TRANSFER_ACCOUNT_ID,
      })

      expect(result.reclassified).toBe(1)
      expect(ops.filter((o) => o.op === 'insert').map((o) => o.table)).toEqual(['transactions'])
      expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual([
        'counterparties', 'transactions', 'accounts',
      ])
      expect(criarPropostas).not.toHaveBeenCalled()
    })

    it('origem com balanceApplied: false — cria a segunda perna mas NÃO move o saldo da conta de destino', async () => {
      // Achado da revisão final (Critical 1): a rodada anterior só corrigiu
      // o `balanceApplied` da PRÓPRIA linha da perna de destino, mas o
      // UPDATE de `accounts` que credita o saldo continuava incondicional —
      // uma origem agendada/futura (`balanceApplied: false`) criava a
      // segunda perna corretamente marcada como não aplicada, e mesmo assim
      // movia o saldo da conta de destino na hora.
      selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership incondicional em confirmCounterparty
      updateQueue.push([]) // update de counterparties
      selectQueue.push([{ id: 'tx-1' }]) // ids pendentes do grupo (applyTransferBatch)
      selectQueue.push([{ // lookup da transação de origem (applyTransferSingle) — balanceApplied: false
        id: 'tx-1', accountId: 'conta-origem', amountCents: -50000,
        date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: false,
      }])
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership: conta pertence à org
      selectQueue.push([]) // isOpenFinanceLinkedAccount: sem recurso -> conta manual
      updateQueue.push([]) // update da linha de origem (transferAccountId, transferGroupId)
      insertQueue.push([{ id: 'tx-1-dest' }]) // insert da segunda perna: entrou de fato
      selectQueue.push([{ one: 1 }]) // ainda sobra pendência resolvível na org

      const result = await confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID,
        nature: 'transfer',
        categoryId: null,
        transferAccountId: TRANSFER_ACCOUNT_ID,
      })

      expect(result.reclassified).toBe(1)
      // A segunda perna entra normalmente...
      expect(ops.filter((o) => o.op === 'insert').map((o) => o.table)).toEqual(['transactions'])
      // ...mas o UPDATE de accounts não roda, porque a origem não tinha o
      // próprio saldo aplicado.
      expect(ops.filter((o) => o.op === 'update' && o.table === 'accounts')).toEqual([])
      expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions'])
      expect(criarPropostas).not.toHaveBeenCalled()
    })

    it('destino é conta Open Finance: cria a perna como previsão, sem mexer no saldo, e propõe a conciliação lá', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }])
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }])
      updateQueue.push([])
      selectQueue.push([{ id: 'tx-1' }])
      selectQueue.push([{
        id: 'tx-1', accountId: 'conta-origem', amountCents: -50000,
        date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: true,
      }])
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership
      selectQueue.push([{ id: 'resource-1' }]) // isOpenFinanceLinkedAccount: linked
      updateQueue.push([]) // update da origem
      insertQueue.push([{ id: 'tx-1-par' }]) // perna prevista entrou
      selectQueue.push([{ one: 1 }])

      const result = await confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID, nature: 'transfer', categoryId: null, transferAccountId: TRANSFER_ACCOUNT_ID,
      })

      expect(result.reclassified).toBe(1)
      expect(insertedValues[0]).toMatchObject({
        accountId: TRANSFER_ACCOUNT_ID,
        externalId: 'ext-1:transfer-par',
        balanceApplied: false,
        transferAccountId: 'conta-origem',
      })
      expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions'])
      expect(criarPropostas).toHaveBeenCalledWith(expect.anything(), ORG, TRANSFER_ACCOUNT_ID)
    })

    it('transferência pra si mesma (conta de destino igual à do lançamento) rejeita', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }])
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership incondicional em confirmCounterparty
      updateQueue.push([])
      selectQueue.push([{ id: 'tx-1' }])
      selectQueue.push([{
        id: 'tx-1', accountId: TRANSFER_ACCOUNT_ID, amountCents: -50000,
        date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: true,
      }])

      await expect(
        confirmCounterparty({
          counterpartyId: COUNTERPARTY_ID,
          nature: 'transfer',
          categoryId: null,
          transferAccountId: TRANSFER_ACCOUNT_ID,
        }),
      ).rejects.toThrow(/mesma conta/)
    })

    it('transferAccountId de outra org rejeita', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
      selectQueue.push([]) // assertAccountOwnership incondicional em confirmCounterparty: nenhuma linha -> conta de outra org

      await expect(
        confirmCounterparty({
          counterpartyId: COUNTERPARTY_ID,
          nature: 'transfer',
          categoryId: null,
          transferAccountId: TRANSFER_ACCOUNT_ID,
        }),
      ).rejects.toThrow(/does not belong|not found/)
    })

    it('sem pendências (fila já zerada) e transferAccountId de outra org: ainda assim rejeita', async () => {
      // Cobre o gap da rodada 2 de revisão: se `applyTransferBatch` não
      // encontrasse nenhum lançamento pendente, o loop nunca chamava
      // `applyTransferSingle` e a checagem de posse nunca rodava —
      // `counterparties.transferAccountId` gravava com uma conta de outra
      // org sem nunca ter sido validada. Aqui a contraparte não tem nenhum
      // lançamento pendente (fila do applyTransferBatch retornaria []), e a
      // checagem incondicional em `confirmCounterparty` precisa rejeitar
      // antes mesmo de chegar lá.
      selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
      selectQueue.push([]) // assertAccountOwnership incondicional: conta de outra org
      selectQueue.push([]) // pending rows do applyTransferBatch (não deveria ser consumido: fila já zerada)

      await expect(
        confirmCounterparty({
          counterpartyId: COUNTERPARTY_ID,
          nature: 'transfer',
          categoryId: null,
          transferAccountId: TRANSFER_ACCOUNT_ID,
        }),
      ).rejects.toThrow(/does not belong|not found/)
    })

    it('exceção com natureza transferência exige sua própria transferAccountId', async () => {
      await expect(
        confirmCounterparty({
          counterpartyId: COUNTERPARTY_ID,
          nature: 'expense',
          categoryId: CATEGORY_ID,
          transferAccountId: null,
          exceptions: [{ transactionId: TX2_ID, nature: 'transfer', categoryId: null, transferAccountId: null }],
        }),
      ).rejects.toThrow()
    })
  })

  describe('lançamento pendente que já tem par não ganha outro', () => {
    // Uma aplicação Nível 1 pendente que `vincularAplicacoesOrfas` já tivesse
    // ligado teria perna real e `transfer_group_id`. Classificar em cima dela
    // sobrescreveria o grupo e inseriria uma SEGUNDA perna: dinheiro em dobro.
    it('lote e lançamento individual de transferência exigem transfer_group_id nulo', async () => {
      filaTransferenciaManual()

      await confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID, nature: 'transfer', categoryId: null, transferAccountId: TRANSFER_ACCOUNT_ID,
      })

      const selectsDeTransacao = ops.filter((o) => o.op === 'select' && o.table === 'transactions')
      const [lote, individual] = selectsDeTransacao
      expect(sqlDoWhere(lote)).toContain('"transfer_group_id" is null')
      expect(sqlDoWhere(individual)).toContain('"transfer_group_id" is null')
    })

    it('lote de receita/despesa também deixa de fora quem já tem par', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }])
      updateQueue.push([])
      updateQueue.push([{ id: 'tx-1' }])
      selectQueue.push([{ one: 1 }])

      await confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'expense', categoryId: CATEGORY_ID, transferAccountId: null })

      const lote = ops.filter((o) => o.op === 'update' && o.table === 'transactions')[0]
      expect(sqlDoWhere(lote)).toContain('"transfer_group_id" is null')
    })
  })

  describe('lote não alcança o que Classificar esconde', () => {
    // A ponta com proposta pendente contra perna prevista some da tela de
    // Classificar; confirmar a contraparte em lote não pode reclassificá-la
    // por trás — a decisão dela está em Confirmar previsões.
    it('lote de transferência deixa de fora a ponta com par de transferência pendente', async () => {
      filaTransferenciaManual()

      await confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID, nature: 'transfer', categoryId: null, transferAccountId: TRANSFER_ACCOUNT_ID,
      })

      const lote = ops.filter((o) => o.op === 'select' && o.table === 'transactions')[0]
      expect(sqlDoWhere(lote)).toContain('fmp.realized_transaction_id = "transactions"."id"')
    })

    it('lote de receita/despesa deixa de fora a ponta com par de transferência pendente', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }])
      updateQueue.push([])
      updateQueue.push([{ id: 'tx-1' }])
      selectQueue.push([{ one: 1 }])

      await confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'expense', categoryId: CATEGORY_ID, transferAccountId: null })

      const lote = ops.filter((o) => o.op === 'update' && o.table === 'transactions')[0]
      expect(sqlDoWhere(lote)).toContain('fmp.realized_transaction_id = "transactions"."id"')
    })
  })
})
