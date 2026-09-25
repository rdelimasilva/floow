import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Importar o arquivo errado (ou na conta errada) não tinha volta: o usuário
 * apagava lançamento por lançamento. Toda linha de uma importação leva o mesmo
 * `importedAt`, então ele identifica o lote — e a exclusão em lote que já
 * existe cuida das duas pernas das transferências e reverte os saldos.
 */
const where = vi.fn()
vi.mock('@/lib/db/rls', () => ({
  withUserDb: (fn: (db: unknown) => unknown) =>
    fn({ select: () => ({ from: () => ({ where: (...a: unknown[]) => where(...a) }) }) }),
}))
vi.mock('@floow/db', () => ({
  transactions: { id: 'id', orgId: 'org_id', accountId: 'account_id', importedAt: 'imported_at' },
}))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: vi.fn(async () => 'org-1') }))
const bulkDeleteTransactions = vi.fn(async () => undefined)
vi.mock('@/lib/finance/transaction-actions', () => ({
  bulkDeleteTransactions: (...a: unknown[]) => bulkDeleteTransactions(...(a as [])),
}))

const { desfazerImportacao } = await import('@/lib/finance/desfazer-importacao')

beforeEach(() => vi.clearAllMocks())

describe('desfazerImportacao', () => {
  it('exclui as linhas do lote e diz quantas foram', async () => {
    where.mockResolvedValue([{ id: 'a' }, { id: 'b' }])

    const removidas = await desfazerImportacao('conta-1', '2026-09-25T19:00:00.123Z')

    expect(bulkDeleteTransactions).toHaveBeenCalledWith(['a', 'b'])
    expect(removidas).toBe(2)
  })

  it('lote vazio (já desfeito) não chama a exclusão', async () => {
    where.mockResolvedValue([])

    expect(await desfazerImportacao('conta-1', '2026-09-25T19:00:00.123Z')).toBe(0)
    expect(bulkDeleteTransactions).not.toHaveBeenCalled()
  })

  it('recusa lote que não é data', async () => {
    await expect(desfazerImportacao('conta-1', 'qualquer')).rejects.toThrow()
    expect(where).not.toHaveBeenCalled()
  })
})
