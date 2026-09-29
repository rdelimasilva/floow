import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/finance/queries-accounts', () => ({ getAccounts: vi.fn() }))

import { getAccounts } from '@/lib/finance/queries-accounts'
import { saldosDasContas } from '@/lib/consultor/ferramentas/saldos-das-contas'
import { reais } from '@/lib/consultor/ferramentas/utils'

const ctx = { orgId: 'org-1', userId: 'u1', canal: 'web' as const }

describe('saldos_das_contas', () => {
  beforeEach(() => vi.mocked(getAccounts).mockReset())

  it('lista cada conta e o total, consultando a org do contexto', async () => {
    vi.mocked(getAccounts).mockResolvedValue([
      { name: 'Itaú', type: 'checking', balanceCents: 150000 },
      { name: 'Nubank', type: 'credit_card', balanceCents: -30000 },
    ] as never)
    const r = await saldosDasContas.executar!(ctx, {})
    expect(getAccounts).toHaveBeenCalledWith('org-1')
    expect(r).toContain(`Itaú (checking): ${reais(150000)}`)
    expect(r).toContain(`Nubank (credit_card): ${reais(-30000)}`)
    expect(r).toContain(`Total: ${reais(120000)}`)
  })

  it('sem conta ativa diz isso', async () => {
    vi.mocked(getAccounts).mockResolvedValue([] as never)
    expect(await saldosDasContas.executar!(ctx, {})).toBe('Nenhuma conta ativa cadastrada.')
  })
})
