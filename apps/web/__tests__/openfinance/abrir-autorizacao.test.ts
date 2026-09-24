import { describe, it, expect, vi } from 'vitest'
import { abrirAutorizacao } from '@/lib/openfinance/abrir-autorizacao'

function abaFalsa() {
  return { opener: {} as unknown, location: { href: '' }, close: vi.fn() }
}

describe('abrirAutorizacao', () => {
  it('abre a aba em branco ANTES de esperar o servidor e depois manda ela para o banco', async () => {
    const aba = abaFalsa()
    const ordem: string[] = []
    const open = vi.fn(() => { ordem.push('open'); return aba })
    const location = { href: 'https://floow/accounts/connect' }
    const r = await abrirAutorizacao(async () => { ordem.push('servidor'); return 'https://banco/auth' }, { open, location })
    expect(ordem).toEqual(['open', 'servidor'])
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(aba.location.href).toBe('https://banco/auth')
    expect(aba.opener).toBeNull()
    expect(location.href).toBe('https://floow/accounts/connect')
    expect(r).toBe('nova-aba')
  })

  it('pop-up bloqueado: cai no redirecionamento na mesma aba', async () => {
    const location = { href: 'https://floow/accounts/connect' }
    const r = await abrirAutorizacao(async () => 'https://banco/auth', { open: () => null, location })
    expect(location.href).toBe('https://banco/auth')
    expect(r).toBe('mesma-aba')
  })

  it('erro no servidor: fecha a aba em branco e repassa o erro', async () => {
    const aba = abaFalsa()
    const location = { href: 'x' }
    await expect(
      abrirAutorizacao(async () => { throw new Error('Polp fora do ar') }, { open: () => aba, location }),
    ).rejects.toThrow('Polp fora do ar')
    expect(aba.close).toHaveBeenCalled()
    expect(location.href).toBe('x')
  })

  it('servidor sem link: fecha a aba e avisa quem chamou', async () => {
    const aba = abaFalsa()
    const r = await abrirAutorizacao(async () => null, { open: () => aba, location: { href: 'x' } })
    expect(aba.close).toHaveBeenCalled()
    expect(r).toBe('sem-url')
  })
})
