import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O passo que vincula, no banco, o previsto ao realizado que o cumpriu.
 *
 * Roda depois da importação e não dentro do `persistPage`: o `returning` do
 * insert de lá traz só id, valor e `balanceApplied`, sem data nem descrição —
 * e é delas que o casamento depende. Como passo separado também cobre o caso
 * inverso, o realizado que chegou antes de o previsto existir.
 *
 * Só previsto ABERTO entra (`balance_applied = false`). Os que já foram
 * aplicados no saldo são o problema do passado, decisão que o dono do produto
 * ainda não tomou.
 */

const selectQueue: unknown[][] = []
const updates: { payload?: Record<string, unknown> }[] = []

function chain(result: unknown[], current?: { payload?: Record<string, unknown> }): any {
  const c: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  for (const m of ['from', 'where', 'limit', 'returning', 'orderBy']) c[m] = () => chain(result, current)
  c.set = (payload: Record<string, unknown>) => {
    if (current) current.payload = payload
    return chain(result, current)
  }
  return c
}

const mockDb = {
  select: () => chain(selectQueue.shift() ?? []),
  update: () => {
    const op: { payload?: Record<string, unknown> } = {}
    updates.push(op)
    return chain([], op)
  },
}

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => mockDb }
})

const { matchForecastsForAccount } = await import('@/lib/finance/forecast-match-db')

const CONTA = 'conta-1'

const PREVISTO_SALARIO = {
  id: 'prev-salario',
  amountCents: 3_250_000,
  date: new Date('2026-10-15T00:00:00Z'),
  description: 'Salário - Soma Cooperativa (10/61)',
}

const REAL_SALARIO = {
  id: 'real-salario',
  amountCents: 3_263_885,
  date: new Date('2026-10-15T00:00:00Z'),
  description: 'Entrada SOMA COOPERATIVA DE TRABALHO EM TECNOLOGIA DA INFORMACAO',
}

beforeEach(() => {
  selectQueue.length = 0
  updates.length = 0
})

describe('matchForecastsForAccount', () => {
  it('vincula o previsto ao realizado que o cumpriu', async () => {
    selectQueue.push([PREVISTO_SALARIO]) // previstos abertos
    selectQueue.push([REAL_SALARIO]) // realizados sem vínculo

    const total = await matchForecastsForAccount(mockDb as never, 'org-1', CONTA)

    expect(total).toBe(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].payload?.matchedTransactionId).toBe('real-salario')
  })

  it('não escreve nada quando não há previsto aberto', async () => {
    selectQueue.push([]) // nenhum previsto

    const total = await matchForecastsForAccount(mockDb as never, 'org-1', CONTA)

    expect(total).toBe(0)
    expect(updates).toHaveLength(0)
  })

  it('um realizado não é reivindicado por dois previstos', async () => {
    // Duas previsões iguais na mesma data: só uma pode casar com o único
    // realizado, senão o índice único do banco estouraria.
    const segundo = { ...PREVISTO_SALARIO, id: 'prev-duplicado' }
    selectQueue.push([PREVISTO_SALARIO, segundo])
    selectQueue.push([REAL_SALARIO])

    const total = await matchForecastsForAccount(mockDb as never, 'org-1', CONTA)

    expect(total).toBe(1)
    expect(updates).toHaveLength(1)
  })

  it('não casa quando o realizado não corresponde a nenhum previsto', async () => {
    const nadaAVer = {
      id: 'real-outro',
      amountCents: -4_500,
      date: new Date('2026-10-15T00:00:00Z'),
      description: 'Padaria do Zé',
    }
    selectQueue.push([PREVISTO_SALARIO])
    selectQueue.push([nadaAVer])

    expect(await matchForecastsForAccount(mockDb as never, 'org-1', CONTA)).toBe(0)
    expect(updates).toHaveLength(0)
  })
})
