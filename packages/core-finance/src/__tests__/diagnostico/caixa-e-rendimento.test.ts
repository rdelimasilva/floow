import { describe, expect, it } from 'vitest'
import { regraR02, regraR03, regraR04 } from '../../diagnostico/caixa-e-rendimento'
import { diagnosticar } from '../../diagnostico'
import { caixa, contexto, posicao } from './fabrica'

describe('R03: dinheiro parado abaixo de 90% do CDI', () => {
  it('dispara com o excedente sobre 6 meses de gasto', () => {
    const r = regraR03(contexto({ caixa: [caixa(10_000_000)] }))
    expect(r?.severidade).toBe('alta')
    expect(r?.metricas.excedenteCents).toBe(4_000_000)
    expect(r?.impactoAnualCents).toBe(Math.round(4_000_000 * 0.109))
  })

  it('não dispara com excedente igual a 0', () => {
    expect(regraR03(contexto({ caixa: [caixa(6_000_000)] }))).toBeNull()
  })

  it('a poupança reduz o valor', () => {
    const corrente = regraR03(contexto({ caixa: [caixa(10_000_000)] }))!
    const poupanca = regraR03(contexto({ caixa: [caixa(10_000_000, 'savings')] }))!
    expect(poupanca.impactoAnualCents!).toBeLessThan(corrente.impactoAnualCents!)
    expect(poupanca.impactoAnualCents).toBe(Math.round(4_000_000 * 0.109 * (1 - 0.0617 / 0.109)))
  })

  it('CDB a 95% do CDI fica fora do grupo', () => {
    const ctx = contexto({
      caixa: [caixa(5_000_000)],
      posicoes: [posicao({ percentualIndexador: 0.95, valorCents: 5_000_000 })],
    })
    expect(regraR03(ctx)).toBeNull()
  })

  it('CDB a 85% do CDI entra no grupo', () => {
    const p = posicao({ percentualIndexador: 0.85, valorCents: 5_000_000 })
    const r = regraR03(contexto({ caixa: [caixa(5_000_000)], posicoes: [p] }))
    expect(r?.posicoes).toEqual([p.assetId])
  })

  it('sem gasto mensal não dispara', () => {
    expect(regraR03(contexto({ caixa: [caixa(10_000_000)], gastoMensalCents: null }))).toBeNull()
  })

  it('sem CDI dispara sem valor', () => {
    const r = regraR03(contexto({ caixa: [caixa(10_000_000)], cdi12m: null }))
    expect(r).not.toBeNull()
    expect(r?.impactoAnualCents).toBeNull()
  })
})

describe('R04: colchão de liquidez', () => {
  it('dispara com líquido de R$ 29.999,99 para gasto de R$ 10 mil', () => {
    const r = regraR04(contexto({ caixa: [caixa(2_999_999)] }))
    expect(r?.severidade).toBe('alta')
    expect(r?.metricas).toEqual({ liquidoCents: 2_999_999, provavelCents: 0, alvoCents: 3_000_000, faltaCents: 1 })
    expect(r?.impactoAnualCents).toBeNull()
  })

  it('não dispara com R$ 30 mil', () => {
    expect(regraR04(contexto({ caixa: [caixa(3_000_000)] }))).toBeNull()
  })

  it('conta Tesouro Selic e não conta CDB sem vencimento próximo', () => {
    const selic = posicao({ classe: 'treasury', subtipo: null, indexador: 'SELIC', valorCents: 3_000_000 })
    const cdb = posicao({ valorCents: 9_000_000, vencimento: '2027-01-01' })
    expect(regraR04(contexto({ posicoes: [selic] }))).toBeNull()
    expect(regraR04(contexto({ posicoes: [cdb] }))?.metricas.liquidoCents).toBe(0)
  })

  it('conta posição que vence amanhã', () => {
    const cdb = posicao({ valorCents: 3_000_000, vencimento: '2026-11-11' })
    expect(regraR04(contexto({ posicoes: [cdb] }))).toBeNull()
  })

  it('sem gasto mensal não dispara', () => {
    expect(regraR04(contexto({ gastoMensalCents: null }))).toBeNull()
  })
})

describe('R02: renda fixa abaixo do CDI', () => {
  it('dispara para CDB a 80% do CDI', () => {
    const p = posicao({ percentualIndexador: 0.8, valorCents: 5_000_000 })
    const [r] = regraR02(contexto({ posicoes: [p] }), new Set())
    expect(r.posicoes).toEqual([p.assetId])
    expect(r.impactoAnualCents).toBe(Math.round(0.109 * 0.2 * 5_000_000))
    expect(r.severidade).toBe('media')
  })

  it('não dispara a 82% do CDI', () => {
    const p = posicao({ percentualIndexador: 0.82 })
    expect(regraR02(contexto({ posicoes: [p] }), new Set())).toEqual([])
  })

  it('fica alta acima de R$ 2.000 por ano', () => {
    const p = posicao({ percentualIndexador: 0.8, valorCents: 20_000_000 })
    expect(regraR02(contexto({ posicoes: [p] }), new Set())[0].severidade).toBe('alta')
  })

  it('ignora posição que já está na R03', () => {
    const p = posicao({ percentualIndexador: 0.8 })
    expect(regraR02(contexto({ posicoes: [p] }), new Set([p.assetId]))).toEqual([])
  })

  it('sem CDI não dispara', () => {
    const p = posicao({ percentualIndexador: 0.5 })
    expect(regraR02(contexto({ posicoes: [p], cdi12m: null }), new Set())).toEqual([])
  })

  it('indexador "di" conta como CDI', () => {
    const p = posicao({ indexador: 'di', percentualIndexador: 0.8 })
    expect(regraR02(contexto({ posicoes: [p] }), new Set())).toHaveLength(1)
  })
})

describe('diagnosticar com R02 e R03', () => {
  it('a posição da R03 não reaparece na R02', () => {
    const p = posicao({ percentualIndexador: 0.5, valorCents: 10_000_000 })
    const { achados } = diagnosticar(contexto({ posicoes: [p] }))
    expect(achados.filter((a) => a.ruleId === 'R03')).toHaveLength(1)
    expect(achados.filter((a) => a.ruleId === 'R02')).toHaveLength(0)
  })
})

describe('R04: CDB que pode ter liquidez diária', () => {
  it('cai para informativo quando o CDB pós-fixado cobre o que falta', () => {
    const cdb = posicao({ subtipo: 'CDB', valorCents: 2_900_000 })
    const r = regraR04(contexto({ caixa: [caixa(200_000)], posicoes: [cdb] }))
    expect(r?.severidade).toBe('info')
    expect(r?.metricas).toMatchObject({ liquidoCents: 200_000, provavelCents: 2_900_000, alvoCents: 3_000_000 })
    expect(r?.dica).toContain('pode ter liquidez diária')
  })

  it('continua alta quando nem a soma cobre', () => {
    const cdb = posicao({ subtipo: 'CDB', valorCents: 1_000_000 })
    const r = regraR04(contexto({ caixa: [caixa(200_000)], posicoes: [cdb] }))
    expect(r?.severidade).toBe('alta')
    expect(r?.metricas.faltaCents).toBe(2_800_000)
  })

  it('LCI e CDB prefixado não contam como provável', () => {
    const lci = posicao({ subtipo: 'LCI', valorCents: 5_000_000 })
    const pre = posicao({ subtipo: 'CDB', indexador: 'PRE_FIXADO', percentualIndexador: null, taxaPrefixada: 0.13, valorCents: 5_000_000 })
    const r = regraR04(contexto({ posicoes: [lci, pre] }))
    expect(r?.severidade).toBe('alta')
    expect(r?.metricas.provavelCents).toBe(0)
  })
})
