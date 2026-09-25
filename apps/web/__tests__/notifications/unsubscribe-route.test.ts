import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock é içado para o topo; o que a fábrica usa precisa vir de vi.hoisted.
const { upsertFrequency, listUserOrgIds } = vi.hoisted(() => ({
  upsertFrequency: vi.fn(async (..._a: unknown[]) => {}),
  listUserOrgIds: vi.fn(async (..._a: unknown[]) => ['org-a', 'org-b']),
}))
vi.mock('@/lib/notifications/preferences-store', () => ({ upsertFrequency, listUserOrgIds }))
vi.mock('@/lib/db/rls', () => ({
  withUserDbFor: vi.fn(async (_u: string, fn: (tx: unknown) => unknown) => fn({})),
}))

import { POST } from '@/app/api/email/unsubscribe/route'
import { signUnsubscribeToken } from '@/lib/notifications/unsubscribe-token'

const USER = '6f1c2b3a-1111-4222-8333-944455556666'
const ORG = '11111111-2222-4333-8444-555566667777'
const req = (token: string) =>
  new Request(`https://app.test/api/email/unsubscribe?token=${token}`, { method: 'POST' })

describe('POST /api/email/unsubscribe', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 's')
    upsertFrequency.mockClear()
  })

  it('token com org desliga o e-mail só daquela org', async () => {
    const res = await POST(req(signUnsubscribeToken(USER, 's', ORG)))
    expect(res.status).toBe(200)
    expect(upsertFrequency).toHaveBeenCalledWith({}, USER, [ORG], 'email', 'off')
  })

  it('token antigo desliga o e-mail em todas as orgs do usuário', async () => {
    await POST(req(signUnsubscribeToken(USER, 's')))
    expect(upsertFrequency).toHaveBeenCalledWith({}, USER, ['org-a', 'org-b'], 'email', 'off')
  })

  it('token inválido não mexe em nada', async () => {
    const res = await POST(req('lixo'))
    expect(res.status).toBe(400)
    expect(upsertFrequency).not.toHaveBeenCalled()
  })
})
