import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Respostas do banco, na ordem das consultas: org+assinatura, depois contagem de contas. */
let respostas: unknown[][] = []
const consulta = () => {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'from', 'leftJoin', 'where']) q[m] = () => q
  q.limit = async () => respostas.shift()
  q.then = (ok: (v: unknown) => unknown) => ok(respostas.shift())
  return q
}
vi.mock('@/lib/db/rls', () => ({ withUserDb: async (fn: (tx: unknown) => unknown) => fn(consulta()) }))
vi.mock('@/lib/auth/session', () => ({ getOrgId: async () => 'org-1' }))
vi.mock('react', async (orig) => ({ ...(await orig<object>()), cache: (fn: unknown) => fn }))

import { exigirPro } from '@/lib/plano/acesso-queries'

const ANTIGA = new Date('2025-01-01T00:00:00Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-12-15T12:00:00Z')) // trial de quem já existia acabou em 18/11
})

describe('exigirPro', () => {
  it('Free depois do trial não usa investimentos', async () => {
    respostas = [[{ criadaEm: ANTIGA, planTier: null, status: null }]]
    await expect(exigirPro('investimentos')).rejects.toThrow('Investimentos faz parte do plano Pro')
  })

  it('assinante passa', async () => {
    respostas = [[{ criadaEm: ANTIGA, planTier: 'pro', status: 'active' }]]
    await expect(exigirPro('investimentos')).resolves.toBeUndefined()
  })

  it('Free cria conta até a segunda', async () => {
    respostas = [[{ criadaEm: ANTIGA, planTier: 'free', status: 'active' }], [{ n: 1 }]]
    await expect(exigirPro('contas')).resolves.toBeUndefined()
    respostas = [[{ criadaEm: ANTIGA, planTier: 'free', status: 'active' }], [{ n: 2 }]]
    await expect(exigirPro('contas')).rejects.toThrow('Mais de 2 contas')
  })
})
