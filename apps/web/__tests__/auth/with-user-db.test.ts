import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  withRls: vi.fn(),
  getServiceDb: vi.fn(() => ({ marca: 'service-db' })),
  requireIdentity: vi.fn(),
}))

vi.mock('@floow/db', () => ({ withRls: h.withRls, getServiceDb: h.getServiceDb }))
vi.mock('@/lib/auth/session', () => ({ requireIdentity: h.requireIdentity }))

import { withUserDb, withUserDbFor } from '@/lib/db/rls'

const USER = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  h.getServiceDb.mockReturnValue({ marca: 'service-db' })
  h.requireIdentity.mockResolvedValue({ userId: USER, orgIds: [] })
  h.withRls.mockImplementation(async (_db, _uid, fn) => fn({ marca: 'tx' }))
})

describe('withUserDb', () => {
  it('aplica o contexto do usuário verificado da requisição', async () => {
    const r = await withUserDb(async (tx) => tx)

    expect(h.withRls).toHaveBeenCalledWith(
      { marca: 'service-db' },
      USER,
      expect.any(Function),
    )
    expect(r).toEqual({ marca: 'tx' })
  })

  it('não roda a query quando não há identidade verificada', async () => {
    h.requireIdentity.mockRejectedValue(new Error('Not authenticated'))
    const fn = vi.fn()

    await expect(withUserDb(fn)).rejects.toThrow('Not authenticated')
    expect(h.withRls).not.toHaveBeenCalled()
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('withUserDbFor', () => {
  it('usa o userId recebido sem ler a identidade da requisição', async () => {
    // unstable_cache proíbe ler cookies dentro do callback — por isso existe
    // esta variante, que recebe o userId por parâmetro.
    await withUserDbFor(USER, async (tx) => tx)

    expect(h.requireIdentity).not.toHaveBeenCalled()
    expect(h.withRls).toHaveBeenCalledWith({ marca: 'service-db' }, USER, expect.any(Function))
  })
})
