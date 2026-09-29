import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/finance/queries-transactions', () => ({ getTransactionsWithCount: vi.fn() }))
vi.mock('@/lib/finance/queries-categories', () => ({ getCategories: vi.fn() }))
vi.mock('@/lib/finance/queries-accounts', () => ({ getAccounts: vi.fn() }))

import { getTransactionsWithCount } from '@/lib/finance/queries-transactions'
import { getCategories } from '@/lib/finance/queries-categories'
import { getAccounts } from '@/lib/finance/queries-accounts'
import { buscarTransacoes, BUSCA_MAX } from '@/lib/consultor/ferramentas/buscar-transacoes'
import { reais } from '@/lib/consultor/ferramentas/utils'

const ctx = { orgId: 'org-1', userId: 'u1' }
const tx = (over: Record<string, unknown> = {}) => ({
  date: new Date(Date.UTC(2026, 8, 10)), description: 'IFOOD *PEDIDO', amountCents: -4500,
  type: 'expense', reviewState: 'confirmed', isIgnored: false, categoryName: 'Delivery', ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('buscar_transacoes', () => {
  it('filtra por texto e período, soma despesas e lista as linhas', async () => {
    vi.mocked(getTransactionsWithCount).mockResolvedValue({ transactions: [tx(), tx({ amountCents: -5500 })], totalCount: 2 } as never)
    const r = await buscarTransacoes.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', texto: 'ifood' })
    expect(getTransactionsWithCount).toHaveBeenCalledWith('org-1', expect.objectContaining({
      startDate: '2026-09-01', endDate: '2026-09-30', search: 'ifood', limit: BUSCA_MAX, sortBy: 'date', sortDir: 'desc',
    }))
    expect(r).toContain(`Total de despesas: ${reais(10000)}`)
    expect(r).toContain(`2026-09-10 | IFOOD *PEDIDO | ${reais(-4500)} | Delivery`)
  })

  it('descarta pendente de revisão e ignorado', async () => {
    vi.mocked(getTransactionsWithCount).mockResolvedValue({
      transactions: [tx(), tx({ reviewState: 'pending' }), tx({ isIgnored: true })], totalCount: 3,
    } as never)
    const r = await buscarTransacoes.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30' })
    expect(r).toContain('1 lançamentos')
    expect(r).toContain(`Total de despesas: ${reais(4500)}`)
  })

  it('categoria vira lista de ids das categorias que casam pelo nome', async () => {
    vi.mocked(getCategories).mockResolvedValue([{ id: 'c1', name: 'Delivery' }, { id: 'c2', name: 'Mercado' }] as never)
    vi.mocked(getTransactionsWithCount).mockResolvedValue({ transactions: [tx()], totalCount: 1 } as never)
    await buscarTransacoes.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', categoria: 'deliv' })
    expect(getTransactionsWithCount).toHaveBeenCalledWith('org-1', expect.objectContaining({ categoryIds: 'c1' }))
  })

  it('categoria inexistente responde sem consultar transações', async () => {
    vi.mocked(getCategories).mockResolvedValue([{ id: 'c1', name: 'Delivery' }] as never)
    const r = await buscarTransacoes.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', categoria: 'viagem' })
    expect(r).toContain('Nenhuma categoria parecida com "viagem"')
    expect(getTransactionsWithCount).not.toHaveBeenCalled()
  })

  it('conta vira accountId pelo nome', async () => {
    vi.mocked(getAccounts).mockResolvedValue([{ id: 'a1', name: 'Nubank' }, { id: 'a2', name: 'Itaú' }] as never)
    vi.mocked(getTransactionsWithCount).mockResolvedValue({ transactions: [tx()], totalCount: 1 } as never)
    await buscarTransacoes.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', conta: 'itau' })
    expect(getTransactionsWithCount).toHaveBeenCalledWith('org-1', expect.objectContaining({ accountId: 'a2' }))
  })

  it('busca que bate o teto avisa que o total está incompleto', async () => {
    const muitas = Array.from({ length: BUSCA_MAX }, () => tx())
    vi.mocked(getTransactionsWithCount).mockResolvedValue({ transactions: muitas, totalCount: 500 } as never)
    const r = await buscarTransacoes.executar!(ctx, { inicio: '2026-01-01', fim: '2026-09-30' })
    expect(r).toContain('INCOMPLETO')
    expect(r.split('\n').filter((l) => l.startsWith('- ')).length).toBe(30)
  })

  it('nada encontrado diz isso', async () => {
    vi.mocked(getTransactionsWithCount).mockResolvedValue({ transactions: [], totalCount: 0 } as never)
    expect(await buscarTransacoes.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30' }))
      .toBe('Nenhum lançamento confirmado encontrado com esses filtros.')
  })
})
