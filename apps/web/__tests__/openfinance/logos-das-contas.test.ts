import { describe, it, expect } from 'vitest'
import { montarLogosDasContas } from '@/lib/openfinance/logos-das-contas'

describe('montarLogosDasContas', () => {
  const logos = new Map([
    ['inst-nubank', 'https://cdn/nubank.png'],
    ['inst-itau', 'https://cdn/itau.png'],
    ['inst-sem-logo', null],
  ])

  it('liga cada conta ao logo do banco da conexão', () => {
    const r = montarLogosDasContas(
      [
        { accountId: 'a1', institutionId: 'inst-nubank' },
        { accountId: 'a2', institutionId: 'inst-itau' },
      ],
      logos,
    )
    expect(r.get('a1')).toBe('https://cdn/nubank.png')
    expect(r.get('a2')).toBe('https://cdn/itau.png')
  })

  it('omite conta cujo banco não tem logo ou não está na lista', () => {
    const r = montarLogosDasContas(
      [
        { accountId: 'a1', institutionId: 'inst-sem-logo' },
        { accountId: 'a2', institutionId: 'inst-sumiu' },
      ],
      logos,
    )
    expect(r.size).toBe(0)
  })

  it('ignora linha sem conta vinculada', () => {
    const r = montarLogosDasContas([{ accountId: null, institutionId: 'inst-nubank' }], logos)
    expect(r.size).toBe(0)
  })
})
