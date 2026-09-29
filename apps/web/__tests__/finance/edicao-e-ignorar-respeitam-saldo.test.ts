import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * Editar e ignorar só mexem no saldo de linha que está (ou deve estar) nele.
 *
 * Os defeitos que estes testes prendem:
 *  - `updateTransaction` aplicava no saldo qualquer linha sem template: a
 *    previsão de parcela (`is_installment_forecast`) entrava no saldo ao ser
 *    editada, e a parcela futura do banco (`external_id`, `balance_applied =
 *    false`) entrava antes do vencimento, somando um valor que ainda não
 *    aconteceu.
 *  - `toggleIgnoreTransaction` movia o saldo em ±valor sem olhar
 *    `balance_applied`: ignorar uma parcela futura tirava do saldo um valor
 *    que nunca tinha entrado nele.
 */

interface Op {
  op: 'insert' | 'update'
  table: string
  payload?: Record<string, unknown>
}

const ops: Op[] = []
const selectQueue: unknown[][] = []
const dialect = new PgDialect()

function chain(result: unknown[], current?: Op): any {
  const c: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  for (const m of ['from', 'where', 'limit', 'returning', 'orderBy']) c[m] = () => chain(result, current)
  for (const m of ['values', 'set']) {
    c[m] = (payload: Record<string, unknown>) => {
      if (current) current.payload = payload
      return chain(result, current)
    }
  }
  return c
}

function tabela(t: unknown): string {
  try {
    return getTableName(t as never)
  } catch {
    return '?'
  }
}

const api = {
  select: () => chain(selectQueue.shift() ?? []),
  insert: (t: unknown) => {
    const op: Op = { op: 'insert', table: tabela(t) }
    ops.push(op)
    return chain([{ id: 'nova' }], op)
  },
  update: (t: unknown) => {
    const op: Op = { op: 'update', table: tabela(t) }
    ops.push(op)
    return chain([], op)
  },
}

const mockDb = { ...api, transaction: async (fn: (tx: unknown) => unknown) => fn(api) }

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => mockDb }
})

vi.mock('@/lib/finance/queries', () => ({
  getOrgId: () => Promise.resolve('org-1'),
  getCategoryRules: () => Promise.resolve([]),
}))
vi.mock('@/lib/investments/queries', () => ({ getPositions: () => Promise.resolve([]) }))
vi.mock('@/lib/cfo/trigger', () => ({ triggerCfoAnalysis: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: (f: unknown) => f, revalidateTag: vi.fn() }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateTransactionData: vi.fn(),
  revalidateAccountData: vi.fn(),
  revalidateSnapshotData: vi.fn(),
  revalidateCategoryData: vi.fn(),
}))

const { updateTransaction, toggleIgnoreTransaction } = await import('@/lib/finance/transaction-actions')

const TX = '44444444-4444-4444-8444-444444444444'
const CONTA = '11111111-1111-4111-8111-111111111111'

const LINHA = {
  id: TX,
  orgId: 'org-1',
  accountId: CONTA,
  amountCents: -45916,
  balanceApplied: true,
  isIgnored: false,
  transferGroupId: null,
  recurringTemplateId: null,
  isInstallmentForecast: false,
  externalId: null as string | null,
}

function formEdicao(date: string) {
  const fd = new FormData()
  fd.append('id', TX)
  fd.append('accountId', CONTA)
  fd.append('type', 'expense')
  fd.append('amountCents', '50000')
  fd.append('description', 'AIRBNB 04/06')
  fd.append('date', date)
  return fd
}

const updatesEmContas = () => ops.filter((o) => o.op === 'update' && o.table === 'accounts')
const updateDaLinha = () => ops.find((o) => o.op === 'update' && o.table === 'transactions')!.payload!
const deltaDe = (o: Op) => dialect.sqlToQuery(o.payload!.balanceCents as never).params

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
})

async function editar(linha: typeof LINHA, date: string) {
  selectQueue.push([linha]) // oldTx
  selectQueue.push([{ id: CONTA }]) // posse da conta
  await updateTransaction(formEdicao(date))
}

describe('updateTransaction e o saldo', () => {
  it('previsão de parcela editada para data passada continua fora do saldo', async () => {
    await editar({ ...LINHA, isInstallmentForecast: true, balanceApplied: false }, '2026-01-10')

    expect(updatesEmContas()).toEqual([])
    expect(updateDaLinha().balanceApplied).toBe(false)
  })

  it('parcela futura do banco editada para data futura continua fora do saldo', async () => {
    await editar({ ...LINHA, externalId: 'polp-4', balanceApplied: false }, '2099-01-10')

    expect(updatesEmContas()).toEqual([])
    expect(updateDaLinha().balanceApplied).toBe(false)
  })

  it('parcela futura do banco editada para data que já chegou entra no saldo uma vez', async () => {
    await editar({ ...LINHA, externalId: 'polp-4', balanceApplied: false }, '2026-01-10')

    const contas = updatesEmContas()
    expect(contas).toHaveLength(1)
    expect(deltaDe(contas[0])).toEqual([-50000])
    expect(updateDaLinha().balanceApplied).toBe(true)
  })

  it('lançamento do banco já aplicado: desfaz o valor antigo e aplica o novo (sem mudança)', async () => {
    await editar({ ...LINHA, externalId: 'polp-1', balanceApplied: true }, '2099-01-10')

    const contas = updatesEmContas()
    expect(contas.map(deltaDe)).toEqual([[45916], [-50000]])
    expect(updateDaLinha().balanceApplied).toBe(true)
  })

  it('lançamento manual continua entrando no saldo mesmo com data futura (sem mudança)', async () => {
    await editar(LINHA, '2099-01-10')

    expect(updatesEmContas().map(deltaDe)).toEqual([[45916], [-50000]])
    expect(updateDaLinha().balanceApplied).toBe(true)
  })

  describe('linha que aguarda o extrato', () => {
    const AGUARDANDO = { ...LINHA, balanceApplied: false, aguardaExtrato: true, origem: 'manual' }

    async function editarAguardando(contaOpenFinance: boolean) {
      selectQueue.push([AGUARDANDO]) // oldTx
      selectQueue.push([{ id: CONTA }]) // posse da conta
      selectQueue.push(contaOpenFinance ? [{ id: 'recurso-of' }] : []) // conta de destino é Open Finance?
      if (contaOpenFinance) selectQueue.push([{ syncFromDate: '2026-01-01' }]) // extrato cobre a data
      await updateTransaction(formEdicao('2026-01-10'))
    }

    it('editada dentro de conta Open Finance continua fora do saldo e aguardando', async () => {
      await editarAguardando(true)

      expect(updatesEmContas()).toEqual([])
      expect(updateDaLinha().balanceApplied).toBe(false)
      expect(updateDaLinha().aguardaExtrato).toBe(true)
    })

    it('movida para conta manual volta ao saldo e perde a marca', async () => {
      await editarAguardando(false)

      const contas = updatesEmContas()
      expect(contas).toHaveLength(1)
      expect(deltaDe(contas[0])).toEqual([-50000])
      expect(updateDaLinha().balanceApplied).toBe(true)
      expect(updateDaLinha().aguardaExtrato).toBe(false)
    })

    describe('convertida em transferência', () => {
      const DESTINO = '22222222-2222-4222-8222-222222222222'
      const pernaInserida = () => ops.find((o) => o.op === 'insert' && o.table === 'transactions')!.payload!

      async function converter(destinoOpenFinance: boolean) {
        selectQueue.push([AGUARDANDO]) // oldTx
        selectQueue.push([{ id: CONTA }]) // posse da origem
        selectQueue.push([{ id: DESTINO }]) // posse do destino
        selectQueue.push([{ id: 'recurso-of' }]) // origem segue Open Finance
        selectQueue.push([{ syncFromDate: '2026-01-01' }]) // origem: extrato cobre a data (aguarda)
        selectQueue.push(destinoOpenFinance ? [{ id: 'recurso-of' }] : []) // destino é Open Finance?
        if (destinoOpenFinance) selectQueue.push([{ syncFromDate: '2026-01-01' }]) // extrato de lá cobre a data
        const fd = formEdicao('2026-01-10')
        fd.set('type', 'transfer')
        fd.append('destAccountId', DESTINO)
        await updateTransaction(fd)
      }

      it('destino manual: a perna entra no saldo e o destino é creditado', async () => {
        await converter(false)

        expect(pernaInserida().balanceApplied).toBe(true)
        expect(pernaInserida().aguardaExtrato).toBe(false)
        expect(updatesEmContas().map(deltaDe)).toEqual([[50000]])
      })

      it('destino Open Finance: a perna aguarda o extrato e fica fora do saldo', async () => {
        await converter(true)

        expect(pernaInserida().balanceApplied).toBe(false)
        expect(pernaInserida().aguardaExtrato).toBe(true)
        expect(updatesEmContas()).toEqual([])
      })
    })
  })
})

/**
 * Antes do início do extrato nada muda (spec §3.2): nenhum extrato vai cobrir
 * o período, e a linha é a única representação do fato. Editar — nem que seja
 * só a categoria — uma linha antiga numa conta Open Finance não pode tirá-la
 * do saldo para sempre.
 */
describe('updateTransaction e o início do extrato', () => {
  const MANUAL_NO_SALDO = { ...LINHA, origem: 'manual', aguardaExtrato: false }

  async function editarEmContaOF(syncFromDate: string) {
    selectQueue.push([MANUAL_NO_SALDO]) // oldTx
    selectQueue.push([{ id: CONTA }]) // posse da conta
    selectQueue.push([{ id: 'recurso-of' }]) // conta é Open Finance
    selectQueue.push([{ syncFromDate }]) // corte de sincronização
    await updateTransaction(formEdicao('2026-03-10'))
  }

  it('linha de antes do corte: fica no saldo e não aguarda', async () => {
    await editarEmContaOF('2026-06-01')

    expect(updatesEmContas().map(deltaDe)).toEqual([[45916], [-50000]])
    expect(updateDaLinha().balanceApplied).toBe(true)
    expect(updateDaLinha().aguardaExtrato).toBe(false)
  })

  it('linha de depois do corte: sai do saldo e aguarda o extrato', async () => {
    await editarEmContaOF('2026-01-01')

    expect(updatesEmContas().map(deltaDe)).toEqual([[45916]])
    expect(updateDaLinha().balanceApplied).toBe(false)
    expect(updateDaLinha().aguardaExtrato).toBe(true)
  })

  it('sem sync_from_date: o corte é a primeira linha do extrato', async () => {
    selectQueue.push([MANUAL_NO_SALDO], [{ id: CONTA }], [{ id: 'recurso-of' }])
    selectQueue.push([{ syncFromDate: null }]) // sem corte escolhido
    selectQueue.push([{ inicio: '2026-05-01' }]) // extrato começa depois da linha
    await updateTransaction(formEdicao('2026-03-10'))

    expect(updateDaLinha().balanceApplied).toBe(true)
    expect(updateDaLinha().aguardaExtrato).toBe(false)
  })
})

function formIgnorar() {
  const fd = new FormData()
  fd.append('id', TX)
  return fd
}

describe('toggleIgnoreTransaction e o saldo', () => {
  it('ignorar linha fora do saldo só marca, sem tirar do saldo o que nunca entrou', async () => {
    selectQueue.push([{ ...LINHA, externalId: 'polp-4', balanceApplied: false }])

    await toggleIgnoreTransaction(formIgnorar())

    expect(updatesEmContas()).toEqual([])
    expect(updateDaLinha()).toEqual({ isIgnored: true })
  })

  it('restaurar linha fora do saldo só desmarca — quem aplica é o vencimento', async () => {
    selectQueue.push([{ ...LINHA, externalId: 'polp-4', balanceApplied: false, isIgnored: true }])

    await toggleIgnoreTransaction(formIgnorar())

    expect(updatesEmContas()).toEqual([])
    expect(updateDaLinha()).toEqual({ isIgnored: false })
  })

  it('ignorar linha aplicada tira o valor do saldo', async () => {
    selectQueue.push([{ ...LINHA, externalId: 'polp-1', balanceApplied: true }])

    await toggleIgnoreTransaction(formIgnorar())

    expect(updatesEmContas().map(deltaDe)).toEqual([[45916]])
  })

  it('restaurar linha aplicada devolve o valor ao saldo', async () => {
    selectQueue.push([{ ...LINHA, externalId: 'polp-1', balanceApplied: true, isIgnored: true }])

    await toggleIgnoreTransaction(formIgnorar())

    expect(updatesEmContas().map(deltaDe)).toEqual([[-45916]])
  })
})
