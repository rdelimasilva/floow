import { describe, it, expect } from 'vitest'
import { somarPrevia } from '@/lib/openfinance/previa-correcao'

const l = (id: string, amountCents: number) => ({ id, accountId: 'itau', amountCents, description: 'Resgate CDB DI', transferGroupId: 'g', balanceApplied: true })

describe('somarPrevia', () => {
  it('XP → Itaú - Corretora (manual): estorno na XP e débito espelhado na nova', () => {
    const p = somarPrevia([
      { l: l('a', 400100), forma: 'perna-real', estorno: { xp: 400100 } },
      { l: l('b', 20084), forma: 'perna-real', estorno: { xp: 20084 } },
    ], 'corretora')
    expect(p).toEqual({ mudam: 2, foraPorParDoOutroLado: [], deltas: { xp: 420184, corretora: -420184 } })
  })
  it('par do outro lado fica fora e não entra no delta', () => {
    const p = somarPrevia([{ l: l('a', 100), forma: 'par-do-outro-lado', estorno: {} }], 'corretora')
    expect(p).toEqual({ mudam: 0, foraPorParDoOutroLado: [{ id: 'a', description: 'Resgate CDB DI' }], deltas: {} })
  })
  it('nova decisão sem conta manual (receita, OF ou CPF próprio): só o estorno', () => {
    expect(somarPrevia([{ l: l('a', 100), forma: 'perna-real', estorno: { xp: 100 } }], null).deltas).toEqual({ xp: 100 })
  })
  it('lançamento não aplicado não gera débito na conta nova', () => {
    const naoAplicado = { ...l('a', 100), balanceApplied: false }
    expect(somarPrevia([{ l: naoAplicado, forma: 'sem-par', estorno: {} }], 'corretora').deltas).toEqual({})
  })
})
