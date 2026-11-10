import { describe, expect, it } from 'vitest'
import { montarContexto, type DadosDoDiagnostico } from '@/lib/investments/diagnostico/montar-contexto'

function dados(parcial: Partial<DadosDoDiagnostico> = {}): DadosDoDiagnostico {
  return {
    hoje: '2026-11-10',
    posicoes: [],
    ativos: [],
    contas: [],
    porAtivo: new Map(),
    gastoMensalCents: 500_000,
    cdi12m: 0.109,
    perfil: null,
    ...parcial,
  }
}

const cdb = {
  id: 'a1',
  ticker: null,
  assetSubtype: 'CDB',
  cnpj: '60701190000104',
  issuerName: 'Itaú',
  indexer: 'CDI',
  indexerPercentage: 0.95,
  preFixedRate: null,
  dueDate: '2027-01-01',
}

describe('montarContexto', () => {
  it('deixa a posição encerrada de fora', () => {
    const ctx = montarContexto(dados({
      posicoes: [
        { assetId: 'a1', name: 'CDB Itaú', assetClass: 'fixed_income', currentValueCents: 1_000, quantityHeld: 1, source: 'openfinance' },
        { assetId: 'a2', name: 'CDB velho', assetClass: 'fixed_income', currentValueCents: 0, quantityHeld: 1, source: 'openfinance' },
      ],
      ativos: [cdb, { ...cdb, id: 'a2' }],
    }))
    expect(ctx.posicoes.map((p) => p.assetId)).toEqual(['a1'])
    expect(ctx.posicoes[0]).toMatchObject({
      subtipo: 'CDB',
      cnpjEmissor: '60701190000104',
      indexador: 'CDI',
      percentualIndexador: 0.95,
      vencimento: '2027-01-01',
      valorCents: 1_000,
    })
  })

  it('só conta corrente, poupança e dinheiro ativos entram no caixa', () => {
    const ctx = montarContexto(dados({
      contas: [
        { id: 'c1', type: 'checking', balanceCents: 100, titular: null, isActive: true },
        { id: 'c2', type: 'savings', balanceCents: 200, titular: null, isActive: true },
        { id: 'c3', type: 'brokerage', balanceCents: 9_000, titular: null, isActive: true },
        { id: 'c4', type: 'credit_card', balanceCents: -500, titular: null, isActive: true },
        { id: 'c5', type: 'checking', balanceCents: 700, titular: null, isActive: false },
        { id: 'c6', type: 'cash', balanceCents: 50, titular: null, isActive: true },
      ],
    }))
    expect(ctx.caixa).toEqual([
      { tipo: 'checking', saldoCents: 100 },
      { tipo: 'savings', saldoCents: 200 },
      { tipo: 'cash', saldoCents: 50 },
    ])
  })

  it('o titular vem da primeira conta do ativo, em ordem de id, que tem titular', () => {
    const ctx = montarContexto(dados({
      posicoes: [{ assetId: 'a1', name: 'CDB Itaú', assetClass: 'fixed_income', currentValueCents: 1_000, quantityHeld: 1, source: 'openfinance' }],
      ativos: [cdb],
      contas: [
        { id: 'b', type: 'brokerage', balanceCents: 0, titular: 'Ana', isActive: true },
        { id: 'a', type: 'brokerage', balanceCents: 0, titular: null, isActive: true },
        { id: 'c', type: 'brokerage', balanceCents: 0, titular: 'Ricardo', isActive: true },
      ],
      porAtivo: new Map([['a1', new Set(['c', 'a', 'b'])]]),
    }))
    expect(ctx.posicoes[0].titular).toBe('Ana')
  })

  it('ativo sem conta fica sem titular', () => {
    const ctx = montarContexto(dados({
      posicoes: [{ assetId: 'a1', name: 'CDB', assetClass: 'fixed_income', currentValueCents: 1, quantityHeld: 1, source: 'manual' }],
      ativos: [cdb],
    }))
    expect(ctx.posicoes[0].titular).toBeNull()
  })
})
