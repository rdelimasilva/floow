import { describe, it, expect, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { mesDaTela } from '@/lib/finance/mes-da-tela'

describe('mesDaTela', () => {
  it('month válido vale; 2026-13 cai no padrão', async () => {
    expect(await mesDaTela('/x', { month: '2026-10-01' })).toBe('2026-10-01')
    expect(await mesDaTela('/x', { month: '2026-13-01' }, () => '2026-11-01')).toBe('2026-11-01')
  })
})
