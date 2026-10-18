/**
 * O histórico de patrimônio (gráfico de evolução, e o Consultor, que lê o
 * netWorthCents do último snapshot) só era gravado no clique de "Atualizar
 * valores": o último da org e37a3049 em 18/10/2026 era de 06/10. A importação
 * agendada passa a gravar também — com a mesma regra do botão, e sem sessão.
 *
 * `snapshot_date` é um dia: gravar de novo no mesmo dia substitui o anterior,
 * em vez de deixar vários pontos para a mesma data (havia três em 04/09).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const h = vi.hoisted(() => ({
  passos: [] as { op: string; where?: { sql: string; params: unknown[] }; values?: Record<string, unknown> }[],
  getPatrimonioAtual: vi.fn(),
  consultarValor: vi.fn(),
  revalidateSnapshotData: vi.fn(),
}))

vi.mock('@floow/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@floow/db')>()
  const dialect = new PgDialect()
  const tx = {
    delete: () => ({
      where: async (w: SQL) => {
        h.passos.push({ op: 'delete', where: dialect.sqlToQuery(w) })
      },
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          h.passos.push({ op: 'insert', values })
          return [{ id: 'snap-1', ...values }]
        },
      }),
    }),
  }
  return {
    patrimonySnapshots: real.patrimonySnapshots,
    getDb: () => ({ transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx) }),
  }
})
vi.mock('@/lib/finance/patrimonio-queries', () => ({ getPatrimonioAtual: h.getPatrimonioAtual }))
vi.mock('@/lib/openfinance/queries', () => ({ consultarValorDasContasDeInvestimento: h.consultarValor }))
vi.mock('@/lib/finance/revalidate', () => ({ revalidateSnapshotData: h.revalidateSnapshotData }))
vi.mock('@/lib/db/rls', () => ({
  withUserDb: () => {
    throw new Error('sem sessão no cron')
  },
}))

const { gravarSnapshotDoPatrimonio, gravarSnapshotDoServico } = await import('@/lib/finance/snapshot-patrimonio')

const patrimonio = {
  patrimonioLiquidoCents: 66434639,
  ativosCents: 66942480,
  passivosCents: 507841,
  blocos: [
    { key: 'contas', titulo: 'Contas', valorCents: 1669490 },
    { key: 'cartoes', titulo: 'Cartões', valorCents: -507841 },
  ],
}

beforeEach(() => {
  h.passos.length = 0
  h.getPatrimonioAtual.mockReset()
  h.consultarValor.mockReset()
  h.revalidateSnapshotData.mockReset()
})

describe('gravarSnapshotDoPatrimonio', () => {
  it('substitui o snapshot do mesmo dia da org e grava o patrimônio da regra única', async () => {
    const saved = await gravarSnapshotDoPatrimonio('org-1', patrimonio)

    expect(h.passos.map((p) => p.op)).toEqual(['delete', 'insert'])
    const [apaga, insere] = h.passos
    expect(apaga.where!.sql).toContain('"org_id" = $1')
    expect(apaga.where!.sql).toContain('"snapshot_date" = $2')
    expect(apaga.where!.params[0]).toBe('org-1')

    expect(insere.values).toMatchObject({
      orgId: 'org-1',
      netWorthCents: 66434639,
      liquidAssetsCents: 66942480,
      liabilitiesCents: 507841,
      breakdown: JSON.stringify({ contas: 1669490, cartoes: -507841 }),
    })
    // O dia apagado é o mesmo dia gravado.
    expect(insere.values!.snapshotDate).toBeInstanceOf(Date)
    expect(apaga.where!.params[1]).toBe((insere.values!.snapshotDate as Date).toISOString())

    expect(h.revalidateSnapshotData).toHaveBeenCalledWith('org-1')
    expect(saved).toMatchObject({ id: 'snap-1', orgId: 'org-1' })
  })
})

describe('gravarSnapshotDoServico', () => {
  it('calcula o patrimônio da org informada sem depender de sessão', async () => {
    h.getPatrimonioAtual.mockImplementation(async (_orgId: string, lerPosicoes: (o: string) => Promise<Map<string, number>>) => {
      await lerPosicoes('org-9')
      return patrimonio
    })
    h.consultarValor.mockResolvedValue(new Map())

    await gravarSnapshotDoServico('org-9')

    expect(h.getPatrimonioAtual).toHaveBeenCalledWith('org-9', expect.any(Function))
    expect(h.consultarValor).toHaveBeenCalledWith(expect.anything(), 'org-9')
    expect(h.passos.map((p) => p.op)).toEqual(['delete', 'insert'])
    expect(h.passos[1].values).toMatchObject({ orgId: 'org-9', netWorthCents: 66434639 })
  })
})
