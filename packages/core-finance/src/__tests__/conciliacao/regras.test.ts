import { describe, it, expect } from 'vitest'
import {
  chaveDoPar,
  conciliarExtratoComAguardando,
  deveAguardarExtrato,
  efeitoDaAbsorcao,
  type LinhaParaConciliar,
} from '../../conciliacao/regras'

/**
 * Numa conta Open Finance só o extrato move o saldo; o resto aguarda e o
 * extrato absorve. Absorver sozinho é seguro porque a linha provisória nunca
 * esteve no saldo: um casamento errado troca uma etiqueta, nunca o saldo.
 * Ambiguidade real vai para a fila.
 */

const linha = (id: string, dateISO: string, amountCents = 20000, counterpartyTaxId: string | null = null): LinhaParaConciliar =>
  ({ id, dateISO, amountCents, counterpartyTaxId })

describe('deveAguardarExtrato', () => {
  it('manual, arquivo e perna aguardam só em conta Open Finance', () => {
    for (const origem of ['manual', 'arquivo', 'perna'] as const) {
      expect(deveAguardarExtrato(origem, true)).toBe(true)
      expect(deveAguardarExtrato(origem, false)).toBe(false)
    }
  })

  it('extrato, ajuste, recorrência, parcela prevista e investimento nunca aguardam', () => {
    for (const origem of ['extrato', 'ajuste', 'recorrencia', 'parcela_prevista', 'investimento'] as const) {
      expect(deveAguardarExtrato(origem, true)).toBe(false)
    }
  })
})

describe('conciliarExtratoComAguardando', () => {
  it('caso de 28/09: cada perna acha a sua linha do extrato e é absorvida', () => {
    const r = conciliarExtratoComAguardando(
      [linha('ext-18', '2026-09-18', 20000, '33076492802'), linha('ext-01', '2026-09-01', 12300, '33076492802')],
      [linha('perna-18', '2026-09-18', 20000), linha('perna-01', '2026-09-01', 12300)],
    )
    expect(r.absorver).toEqual([
      { aguardandoId: 'perna-01', extratoId: 'ext-01' },
      { aguardandoId: 'perna-18', extratoId: 'ext-18' },
    ])
    expect(r.propor).toEqual([])
  })

  it('valor diferente em um centavo não casa', () => {
    const r = conciliarExtratoComAguardando([linha('e', '2026-09-18', 20001)], [linha('a', '2026-09-18', 20000)])
    expect(r).toEqual({ absorver: [], propor: [] })
  })

  it('janela de 3 dias: 3 casa, 4 não', () => {
    expect(conciliarExtratoComAguardando([linha('e', '2026-09-21')], [linha('a', '2026-09-18')]).absorver).toHaveLength(1)
    expect(conciliarExtratoComAguardando([linha('e', '2026-09-22')], [linha('a', '2026-09-18')]).absorver).toHaveLength(0)
  })

  it('contraparte declarada dos dois lados e diferente não casa; ausente de um lado casa', () => {
    expect(conciliarExtratoComAguardando([linha('e', '2026-09-18', 20000, '111')], [linha('a', '2026-09-18', 20000, '222')]).absorver).toHaveLength(0)
    expect(conciliarExtratoComAguardando([linha('e', '2026-09-18', 20000, '111')], [linha('a', '2026-09-18', 20000, null)]).absorver).toHaveLength(1)
  })

  it('dois extratos para um aguardando: não absorve, propõe o de data mais próxima', () => {
    const r = conciliarExtratoComAguardando(
      [linha('longe', '2026-09-20'), linha('perto', '2026-09-18')],
      [linha('a', '2026-09-18')],
    )
    expect(r.absorver).toEqual([])
    expect(r.propor).toEqual([{ aguardandoId: 'a', extratoId: 'perto' }])
  })

  it('dois aguardando para um extrato: não absorve e propõe uma vez só (índice único por ponta)', () => {
    const r = conciliarExtratoComAguardando(
      [linha('e', '2026-09-18')],
      [linha('a1', '2026-09-17'), linha('a2', '2026-09-18')],
    )
    expect(r.absorver).toEqual([])
    expect(r.propor).toHaveLength(1)
    expect(new Set(r.propor.map((p) => p.extratoId)).size).toBe(r.propor.length)
  })

  it('par recusado pelo usuário não volta, nem como absorção nem como proposta', () => {
    const r = conciliarExtratoComAguardando(
      [linha('e', '2026-09-18')],
      [linha('a', '2026-09-18')],
      new Set([chaveDoPar('a', 'e')]),
    )
    expect(r).toEqual({ absorver: [], propor: [] })
  })

  it('par único convive com grupo ambíguo sem ser contaminado por ele', () => {
    const r = conciliarExtratoComAguardando(
      [linha('e-unico', '2026-09-01', 500), linha('e1', '2026-09-18'), linha('e2', '2026-09-19')],
      [linha('a-unico', '2026-09-01', 500), linha('a', '2026-09-18')],
    )
    expect(r.absorver).toEqual([{ aguardandoId: 'a-unico', extratoId: 'e-unico' }])
    expect(r.propor).toEqual([{ aguardandoId: 'a', extratoId: 'e1' }])
  })
})

describe('efeitoDaAbsorcao', () => {
  const extratoPendente = { reviewState: 'pending' as const, categoryId: null, isAutoCategorized: false }

  it('perna: o extrato vira a ponta da transferência', () => {
    expect(
      efeitoDaAbsorcao({ origem: 'perna', categoryId: null, description: 'Transferência recebida' }, extratoPendente, 'conta-itau'),
    ).toEqual({ type: 'transfer', categoryId: null, reviewState: 'confirmed', transferAccountId: 'conta-itau' })
  })

  it('perna sem outra conta conhecida: não inventa transferência', () => {
    expect(efeitoDaAbsorcao({ origem: 'perna', categoryId: null, description: 'x' }, extratoPendente, null)).toBeNull()
  })

  it('manual: o extrato ainda não classificado herda categoria e descrição do usuário', () => {
    expect(
      efeitoDaAbsorcao({ origem: 'manual', categoryId: 'cat-mercado', description: 'Feira' }, extratoPendente, null),
    ).toEqual({ categoryId: 'cat-mercado', description: 'Feira', reviewState: 'confirmed', isAutoCategorized: false })
  })

  it('categoria automática não conta como classificação: a do usuário vence', () => {
    const auto = { reviewState: 'confirmed' as const, categoryId: 'cat-polp', isAutoCategorized: true }
    expect(efeitoDaAbsorcao({ origem: 'arquivo', categoryId: 'cat-user', description: 'Luz' }, auto, null)).toMatchObject({ categoryId: 'cat-user' })
  })

  it('extrato já classificado à mão fica como está', () => {
    const classificado = { reviewState: 'confirmed' as const, categoryId: 'cat-x', isAutoCategorized: false }
    expect(efeitoDaAbsorcao({ origem: 'manual', categoryId: 'cat-y', description: 'y' }, classificado, null)).toBeNull()
  })

  it('manual sem categoria não apaga a do extrato', () => {
    expect(efeitoDaAbsorcao({ origem: 'manual', categoryId: null, description: 'y' }, extratoPendente, null)).toBeNull()
  })
})
