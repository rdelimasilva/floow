import { describe, it, expect } from 'vitest'
import { parseSgs, CODIGOS_SGS } from '../mercado/bcb'
import { dataBr, numeroBr, soDigitos } from '../mercado/util'

describe('utilitários de formato brasileiro', () => {
  it('dataBr converte dd/MM/aaaa e recusa data impossível', () => {
    expect(dataBr('05/11/2026')).toBe('2026-11-05')
    expect(dataBr('31/02/2026')).toBeNull()
    expect(dataBr('xx')).toBeNull()
  })

  it('numeroBr lê vírgula decimal e vazio vira null', () => {
    expect(numeroBr('20216,19')).toBe(20216.19)
    expect(numeroBr('')).toBeNull()
    expect(numeroBr('abc')).toBeNull()
  })

  it('soDigitos tira a pontuação do CNPJ', () => {
    expect(soDigitos('00.017.024/0001-53')).toBe('00017024000153')
  })
})

describe('parseSgs', () => {
  it('códigos das séries', () => {
    expect(CODIGOS_SGS).toEqual({ cdi: 12, selic: 11, ipca: 433 })
  })

  it('lê a resposta do SGS', () => {
    const r = parseSgs('cdi', [
      { data: '04/11/2026', valor: '0.050788' },
      { data: '05/11/2026', valor: '0.050788' },
    ])
    expect(r.invalidas).toBe(0)
    expect(r.linhas).toEqual([
      { serie: 'cdi', data: '2026-11-04', valor: 0.050788 },
      { serie: 'cdi', data: '2026-11-05', valor: 0.050788 },
    ])
  })

  it('conta item quebrado sem derrubar os outros', () => {
    const r = parseSgs('cdi', [{ data: 'xx', valor: '1' }, { data: '05/11/2026', valor: '0.05' }])
    expect(r.invalidas).toBe(1)
    expect(r.linhas).toHaveLength(1)
  })

  it('resposta que não é lista é erro', () => {
    expect(() => parseSgs('cdi', { erro: 'x' })).toThrow(/SGS/)
  })
})
