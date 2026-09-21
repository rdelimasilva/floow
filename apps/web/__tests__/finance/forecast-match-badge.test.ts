import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O callback do `unstable_cache` roda fora do escopo de uma requisição e não
 * pode ler cookies — ler cookies lá dentro lança, e como `(app)/layout.tsx`
 * chama o contador em toda navegação sem error boundary próprio, o erro vira
 * tela branca em vez da tela de "tentar de novo".
 *
 * Este teste mocka `cookies()` de `next/headers` para lançar e prova que o
 * caminho do contador nunca o invoca: a identidade entra por fora, como
 * `userId` explícito (via `withUserDbFor`), nunca resolvida de dentro do
 * cache. Se alguém reintroduzir uma dependência de cookies() aqui, este
 * teste quebra.
 */

const h = vi.hoisted(() => ({
  withRls: vi.fn(),
  getServiceDb: vi.fn(() => ({ marca: 'service-db' })),
}))

vi.mock('next/headers', () => ({
  cookies: () => {
    throw new Error('cookies() só pode ser lido dentro do escopo de uma requisição')
  },
}))

vi.mock('next/cache', () => ({ unstable_cache: (f: unknown) => f, revalidateTag: vi.fn() }))

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, withRls: h.withRls, getServiceDb: h.getServiceDb }
})

const { contagemDeConciliacoesPendentes } = await import('@/lib/finance/forecast-match-badge')

const ORG = 'org-1'
const USER = 'user-1'

beforeEach(() => {
  vi.clearAllMocks()
  h.getServiceDb.mockReturnValue({ marca: 'service-db' })
  h.withRls.mockImplementation(async (_db, _userId, fn) =>
    fn({
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ total: 3 }]),
        }),
      }),
    }),
  )
})

describe('contagemDeConciliacoesPendentes', () => {
  it('devolve o número mesmo com cookies() lançando dentro do processo', async () => {
    const total = await contagemDeConciliacoesPendentes(ORG, USER)

    expect(total).toBe(3)
  })

  it('resolve o contexto de RLS pelo userId explícito, não por cookie', async () => {
    await contagemDeConciliacoesPendentes(ORG, USER)

    expect(h.withRls).toHaveBeenCalledWith({ marca: 'service-db' }, USER, expect.any(Function))
  })
})
