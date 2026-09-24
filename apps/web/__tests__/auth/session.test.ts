import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────
// vi.hoisted é necessário: as factories de vi.mock sobem para o topo do arquivo,
// acima dos `const`, e sem isso referenciar os mocks dá "Cannot access before
// initialization".
const h = vi.hoisted(() => ({
  limit: vi.fn(),
  getDb: vi.fn(),
  getClaims: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('@floow/db', () => ({
  getDb: h.getDb,
  orgMembers: { orgId: 'org_id', userId: 'user_id', createdAt: 'created_at' },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: h.getClaims, getSession: h.getSession, getUser: h.getUser },
  })),
}))

import { getVerifiedIdentity, getOrgId, requireUserId, getAuthenticatedUser, getShellProfile } from '@/lib/auth/session'

const ORG = '11111111-1111-1111-1111-111111111111'
const USER = '22222222-2222-2222-2222-222222222222'

function claimsOk(orgIds?: string[]) {
  return {
    data: {
      claims: {
        sub: USER,
        app_metadata: orgIds ? { org_ids: orgIds } : {},
      },
    },
    error: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.limit.mockResolvedValue([])
  h.getDb.mockReturnValue({
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: h.limit }) }),
      }),
    }),
  })
})

describe('getVerifiedIdentity', () => {
  it('nunca usa getSession — o cookie não pode decidir quem é o usuário', async () => {
    h.getClaims.mockResolvedValue(claimsOk([ORG]))

    await getVerifiedIdentity()

    expect(h.getClaims).toHaveBeenCalled()
    expect(h.getSession).not.toHaveBeenCalled()
  })

  it('devolve null quando a assinatura do JWT não confere', async () => {
    h.getClaims.mockResolvedValue({
      data: null,
      error: { name: 'AuthInvalidJwtError', message: 'Invalid JWT signature' },
    })

    expect(await getVerifiedIdentity()).toBeNull()
  })
})

describe('getOrgId', () => {
  it('recusa um JWT com assinatura inválida em vez de confiar no org_ids do payload', async () => {
    h.getClaims.mockResolvedValue({
      data: null,
      error: { name: 'AuthInvalidJwtError', message: 'Invalid JWT signature' },
    })

    await expect(getOrgId()).rejects.toThrow('Not authenticated')
    expect(h.getDb).not.toHaveBeenCalled()
  })

  it('usa o org_ids das claims verificadas', async () => {
    h.getClaims.mockResolvedValue(claimsOk([ORG]))

    expect(await getOrgId()).toBe(ORG)
    expect(h.getDb).not.toHaveBeenCalled()
  })

  it('cai para org_members usando o sub verificado quando a claim está ausente', async () => {
    h.getClaims.mockResolvedValue(claimsOk())
    h.limit.mockResolvedValue([{ orgId: ORG }])

    expect(await getOrgId()).toBe(ORG)
    expect(h.getDb).toHaveBeenCalled()
  })

  it('lança quando o usuário verificado não pertence a nenhuma org', async () => {
    h.getClaims.mockResolvedValue(claimsOk())
    h.limit.mockResolvedValue([])

    await expect(getOrgId()).rejects.toThrow('No organization found for user')
  })
})

describe('requireUserId', () => {
  it('devolve o sub das claims verificadas', async () => {
    h.getClaims.mockResolvedValue(claimsOk([ORG]))

    expect(await requireUserId()).toBe(USER)
  })

  it('lança quando não há identidade verificada', async () => {
    h.getClaims.mockResolvedValue({ data: null, error: { message: 'no session' } })

    await expect(requireUserId()).rejects.toThrow('Not authenticated')
  })
})

describe('getAuthenticatedUser', () => {
  it('devolve o user autenticado pelo servidor de Auth', async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: USER, email: 'a@b.com' } }, error: null })

    const user = await getAuthenticatedUser()

    expect(user?.id).toBe(USER)
    expect(h.getSession).not.toHaveBeenCalled()
  })

  it('devolve null quando o servidor de Auth recusa o token', async () => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } })

    expect(await getAuthenticatedUser()).toBeNull()
  })
})

describe('getShellProfile', () => {
  it('monta nome, e-mail e avatar das claims verificadas, sem ir ao servidor de Auth', async () => {
    h.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: USER,
          email: 'ana@example.com',
          user_metadata: { full_name: 'Ana', avatar_url: 'https://x/a.png' },
          app_metadata: {},
        },
      },
      error: null,
    })

    const profile = await getShellProfile()

    expect(profile).toEqual({ userId: USER, email: 'ana@example.com', name: 'Ana', avatarUrl: 'https://x/a.png' })
    expect(h.getUser).not.toHaveBeenCalled()
  })

  it('aceita os nomes de campo do login Google (name, picture)', async () => {
    h.getClaims.mockResolvedValue({
      data: { claims: { sub: USER, email: 'b@x.com', user_metadata: { name: 'Bia', picture: 'https://x/p.png' } } },
      error: null,
    })

    const profile = await getShellProfile()

    expect(profile?.name).toBe('Bia')
    expect(profile?.avatarUrl).toBe('https://x/p.png')
  })

  it('sem metadata, nome e avatar vêm nulos e o e-mail segue', async () => {
    h.getClaims.mockResolvedValue({ data: { claims: { sub: USER, email: 'c@x.com' } }, error: null })

    expect(await getShellProfile()).toEqual({ userId: USER, email: 'c@x.com', name: null, avatarUrl: null })
  })

  it('devolve null quando a assinatura não confere', async () => {
    h.getClaims.mockResolvedValue({ data: null, error: new Error('invalid signature') })

    expect(await getShellProfile()).toBeNull()
  })
})
