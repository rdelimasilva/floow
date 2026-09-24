import { describe, it, expect } from 'vitest'
import { decidirVinculo, janelaDeMovimentacoes } from '@/lib/openfinance/investimentos/vinculo'

describe('decidirVinculo', () => {
  it('investimento nunca visto é novo', () => {
    expect(decidirVinculo(undefined, 'org-a')).toEqual({ tipo: 'novo' })
  })
  it('já é desta org: reaproveita recurso e ativo', () => {
    expect(decidirVinculo({ id: 'r1', orgId: 'org-a', assetId: 'a1' }, 'org-a')).toEqual({ tipo: 'meu', resourceId: 'r1', assetId: 'a1' })
  })
  it('pertence a outra org: conflito, nunca atualizar a linha alheia', () => {
    expect(decidirVinculo({ id: 'r1', orgId: 'org-b', assetId: 'a1' }, 'org-a')).toEqual({ tipo: 'conflito' })
  })
})

describe('janelaDeMovimentacoes', () => {
  it('primeira vez: sem filtro, puxa todo o histórico', () => {
    expect(janelaDeMovimentacoes(null)).toEqual({})
  })
  it('depois: última data menos 7 dias, para pegar lançamento atrasado', () => {
    expect(janelaDeMovimentacoes('2026-09-20')).toEqual({ fromDate: '2026-09-13T00:00:00Z' })
  })
  it('virada de mês', () => {
    expect(janelaDeMovimentacoes('2026-03-03')).toEqual({ fromDate: '2026-02-24T00:00:00Z' })
  })
})
