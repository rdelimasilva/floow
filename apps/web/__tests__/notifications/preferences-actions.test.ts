import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock é içado para o topo; o que a fábrica usa precisa vir de vi.hoisted.
const { USER, upsertFrequency } = vi.hoisted(() => ({
  USER: '6f1c2b3a-1111-4222-8333-944455556666',
  upsertFrequency: vi.fn(async (..._a: unknown[]) => {}),
}))
const ORG = '11111111-2222-4333-8444-555566667777'
vi.mock('@/lib/auth/session', () => ({ requireUserId: vi.fn(async () => USER) }))
vi.mock('@/lib/db/rls', () => ({ withUserDb: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})) }))
vi.mock('@/lib/notifications/preferences-store', () => ({ upsertFrequency }))

import { setNotificationFrequency } from '@/lib/notifications/preferences-actions'

describe('setNotificationFrequency', () => {
  beforeEach(() => upsertFrequency.mockClear())

  it('grava para o usuário da sessão, só na org pedida', async () => {
    await setNotificationFrequency(ORG, 'whatsapp', 'daily')
    expect(upsertFrequency).toHaveBeenCalledWith({}, USER, [ORG], 'whatsapp', 'daily')
  })

  it.each([
    [ORG, 'sms', 'daily'],
    [ORG, 'email', 'hourly'],
    ['nao-uuid', 'email', 'off'],
  ])('recusa entrada inválida (%s, %s, %s)', async (org, ch, fr) => {
    await expect(setNotificationFrequency(org, ch, fr)).rejects.toThrow('Preferência inválida')
    expect(upsertFrequency).not.toHaveBeenCalled()
  })
})
