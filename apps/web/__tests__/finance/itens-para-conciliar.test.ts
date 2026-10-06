import { describe, it, expect, vi } from 'vitest'
const contarFila = vi.fn()
vi.mock('@/lib/finance/conciliacao/fila-db', () => ({ contarFila }))
const { contarItensParaConciliar } = await import('@/lib/finance/itens-para-conciliar')

describe('contarItensParaConciliar', () => {
  it('lê a contagem da fila', async () => {
    contarFila.mockResolvedValue({ repetidos: 1, classificar: 2, confirmar: 1, total: 3 })
    expect(await contarItensParaConciliar('org-1', 'user-1')).toEqual({ repetidos: 1, classificar: 2, confirmar: 1, total: 3 })
  })
  it('sem usuário ou com falha, zero (fail open)', async () => {
    expect((await contarItensParaConciliar('org-1', null)).total).toBe(0)
    contarFila.mockRejectedValue(new Error('x'))
    expect((await contarItensParaConciliar('org-2', 'user-1')).total).toBe(0)
  })
})
