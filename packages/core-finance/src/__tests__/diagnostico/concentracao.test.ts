import { describe, expect, it } from 'vitest'
import { regraR05, regraR06, regraR07 } from '../../diagnostico/concentracao'
import { caixa, contexto, posicao } from './fabrica'

const acao = (valorCents: number) =>
  posicao({ classe: 'br_equity', subtipo: null, ticker: 'PETR4', indexador: null, percentualIndexador: null, valorCents })

describe('R05: concentração por ativo ou emissor', () => {
  it('não dispara com 20% exatos', () => {
    expect(regraR05(contexto({ posicoes: [acao(200_000)], caixa: [caixa(800_000)] }))).toEqual([])
  })

  it('dispara com 20,01%, como média', () => {
    const [r] = regraR05(contexto({ posicoes: [acao(200_100)], caixa: [caixa(799_900)] }))
    expect(r.severidade).toBe('media')
    expect(r.metricas.peso).toBeCloseTo(0.2001)
  })

  it('fica alta com 30,01%', () => {
    const [r] = regraR05(contexto({ posicoes: [acao(300_100)], caixa: [caixa(699_900)] }))
    expect(r.severidade).toBe('alta')
  })

  it('soma CDBs do mesmo banco com e sem máscara no CNPJ', () => {
    const a = posicao({ cnpjEmissor: '12.345.678/0001-99', valorCents: 150_000 })
    const b = posicao({ cnpjEmissor: '12345678000199', valorCents: 150_000 })
    const [r] = regraR05(contexto({ posicoes: [a, b], caixa: [caixa(700_000)] }))
    expect(r.posicoes.sort()).toEqual([a.assetId, b.assetId].sort())
    expect(r.metricas.peso).toBeCloseTo(0.3)
  })

  it('junta RF bancária e crédito privado do mesmo emissor', () => {
    const cdb = posicao({ cnpjEmissor: '60701190000104', valorCents: 150_000 })
    const deb = posicao({ classe: 'credit_fixed_income', subtipo: 'DEBENTURES', cnpjEmissor: '60701190000104', valorCents: 150_000 })
    expect(regraR05(contexto({ posicoes: [cdb, deb], caixa: [caixa(700_000)] }))).toHaveLength(1)
  })

  it('ETF e Tesouro com 50% não disparam', () => {
    const etf = posicao({ classe: 'etf', subtipo: null, ticker: 'BOVA11', valorCents: 500_000 })
    const tesouro = posicao({ classe: 'treasury', subtipo: null, valorCents: 500_000 })
    expect(regraR05(contexto({ posicoes: [etf, tesouro] }))).toEqual([])
  })
})

describe('R06: acima da cobertura do FGC', () => {
  it('não dispara com R$ 250.000,00', () => {
    const p = posicao({ cnpjEmissor: '60701190000104', valorCents: 25_000_000, titular: 'Ricardo' })
    expect(regraR06(contexto({ posicoes: [p] }))).toEqual([])
  })

  it('dispara com R$ 250.000,01, exposição de 1 centavo', () => {
    const p = posicao({ cnpjEmissor: '60701190000104', valorCents: 25_000_001, titular: 'Ricardo' })
    const [r] = regraR06(contexto({ posicoes: [p] }))
    expect(r.exposicaoCents).toBe(1)
    expect(r.severidade).toBe('media')
  })

  it('dois titulares com R$ 200 mil cada no mesmo banco não disparam', () => {
    const a = posicao({ cnpjEmissor: '60701190000104', valorCents: 20_000_000, titular: 'Ricardo' })
    const b = posicao({ cnpjEmissor: '60701190000104', valorCents: 20_000_000, titular: 'Ana' })
    expect(regraR06(contexto({ posicoes: [a, b] }))).toEqual([])
  })

  it('debênture fica fora', () => {
    const p = posicao({ classe: 'credit_fixed_income', subtipo: 'DEBENTURES', cnpjEmissor: '60701190000104', valorCents: 30_000_000 })
    expect(regraR06(contexto({ posicoes: [p] }))).toEqual([])
  })
})

describe('R07: concentração por classe', () => {
  const rf = posicao({ valorCents: 810_000 })
  const resto = [caixa(190_000)]

  it('sem perfil ou conservador não roda', () => {
    expect(regraR07(contexto({ posicoes: [rf], caixa: resto, perfil: null }))).toEqual([])
    expect(regraR07(contexto({ posicoes: [rf], caixa: resto, perfil: 'conservador' }))).toEqual([])
  })

  it('moderado com 81% em renda fixa dispara', () => {
    const [r] = regraR07(contexto({ posicoes: [rf], caixa: resto, perfil: 'moderado' }))
    expect(r.severidade).toBe('media')
    expect(r.metricas.peso).toBeCloseTo(0.81)
  })
})

describe('total zero', () => {
  it('não gera achado', () => {
    const ctx = contexto({ posicoes: [acao(0)], perfil: 'arrojado' })
    expect([...regraR05(ctx), ...regraR06(ctx), ...regraR07(ctx)]).toEqual([])
  })
})
