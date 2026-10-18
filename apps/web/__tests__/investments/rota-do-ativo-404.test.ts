import { describe, it, expect, vi, beforeEach } from 'vitest'

// Rota de ativo que não existe (/investments/qualquer-coisa) dava erro de
// Postgres ("invalid input syntax for type uuid") e caía na tela de erro com
// código. Agora é 404.
const { notFound, getAssets, getPortfolioEvents, getPortfolioEventById } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  getAssets: vi.fn(),
  getPortfolioEvents: vi.fn(),
  getPortfolioEventById: vi.fn(),
}))
vi.mock('next/navigation', () => ({ notFound, redirect: vi.fn() }))
vi.mock('@/lib/investments/queries', () => ({ getAssets, getPortfolioEvents, getPortfolioEventById }))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: vi.fn(async () => 'org-1'), getAccounts: vi.fn(async () => []) }))
vi.mock('@/lib/investments/bank-position-queries', () => ({ getLatestBankPosition: vi.fn() }))

const UUID = '3f2b6a1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

beforeEach(() => {
  vi.clearAllMocks()
  getAssets.mockResolvedValue([])
  getPortfolioEvents.mockResolvedValue([])
  getPortfolioEventById.mockResolvedValue(null)
})

describe('rota de ativo inexistente vira 404', () => {
  it('id que não é uuid não chega a consultar o banco', async () => {
    const { default: Page } = await import('@/app/(app)/investments/[assetId]/page')
    await expect(Page({ params: Promise.resolve({ assetId: 'nao-existe' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getPortfolioEvents).not.toHaveBeenCalled()
  })

  it('uuid que não é ativo da org também é 404', async () => {
    const { default: Page } = await import('@/app/(app)/investments/[assetId]/page')
    await expect(Page({ params: Promise.resolve({ assetId: UUID }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('edição de ativo inexistente é 404', async () => {
    const { default: Page } = await import('@/app/(app)/investments/[assetId]/edit/page')
    await expect(Page({ params: Promise.resolve({ assetId: 'abc' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getAssets).not.toHaveBeenCalled()
  })

  it('edição de evento com id que não é uuid é 404 sem consultar', async () => {
    const { default: Page } = await import('@/app/(app)/investments/events/[eventId]/edit/page')
    await expect(Page({ params: Promise.resolve({ eventId: 'abc' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getPortfolioEventById).not.toHaveBeenCalled()
  })
})
