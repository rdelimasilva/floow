import { describe, expect, it, vi } from 'vitest'

/**
 * `executarBackfillDeTransferencias`: abre o banco e roda, nesta ordem, a
 * devolução das transferências sem par para Classificar e a criação das
 * pernas previstas que faltam.
 */

const DB = { fake: true }
const devolver = vi.fn(async (..._a: unknown[]) => ({ devolvidas: 3, semChave: 1 }))
const pernas = vi.fn(async (..._a: unknown[]) => ({ criadas: 2 }))

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => DB }
})
vi.mock('@/lib/openfinance/config', () => ({ getPolpClient: vi.fn() }))
vi.mock('@/lib/openfinance/transferencias-sem-par', () => ({ devolverTransferenciasSemParAClassificar: devolver }))
vi.mock('@/lib/openfinance/pernas-faltantes', () => ({ criarPernasPrevistasFaltantes: pernas }))

const { executarBackfillDeTransferencias } = await import('@/lib/openfinance/backfill')

describe('executarBackfillDeTransferencias', () => {
  it('roda a rotina direcionada antes das pernas faltantes e devolve as duas contagens', async () => {
    const r = await executarBackfillDeTransferencias('org-1')

    expect(devolver).toHaveBeenCalledWith(DB, 'org-1')
    expect(pernas).toHaveBeenCalledWith(DB, 'org-1')
    expect(devolver.mock.invocationCallOrder[0]).toBeLessThan(pernas.mock.invocationCallOrder[0])
    expect(r).toEqual({ transferenciasDevolvidas: 3, transferenciasSemChave: 1, pernasPrevistas: 2 })
  })
})
