import { describe, it, expect } from 'vitest'
import { somarPrevia } from '@/lib/openfinance/previa-correcao'

const l = (id: string, amountCents: number) => ({ id, accountId: 'itau', amountCents, description: 'Resgate CDB DI', transferGroupId: 'g', balanceApplied: true, isIgnored: false })

describe('somarPrevia', () => {
  it('XP → Itaú - Corretora (manual): estorno na XP e débito espelhado na nova', () => {
    const p = somarPrevia([
      { l: l('a', 400100), forma: 'perna-real', estorno: { xp: 400100 } },
      { l: l('b', 20084), forma: 'perna-real', estorno: { xp: 20084 } },
    ], 'corretora')
    expect(p).toEqual({ mudam: 2, foraPorParDoOutroLado: [], deltas: { xp: 420184, corretora: -420184 }, naContaNova: 0 })
  })
  it('par do outro lado fica fora e não entra no delta', () => {
    const p = somarPrevia([{ l: l('a', 100), forma: 'par-do-outro-lado', estorno: {} }], 'corretora')
    expect(p).toEqual({ mudam: 0, foraPorParDoOutroLado: [{ id: 'a', description: 'Resgate CDB DI' }], deltas: {}, naContaNova: 0 })
  })
  it('nova decisão sem conta manual (receita, OF ou CPF próprio): só o estorno', () => {
    expect(somarPrevia([{ l: l('a', 100), forma: 'perna-real', estorno: { xp: 100 } }], null).deltas).toEqual({ xp: 100 })
  })
  it('lançamento não aplicado não gera débito na conta nova', () => {
    const naoAplicado = { ...l('a', 100), balanceApplied: false }
    expect(somarPrevia([{ l: naoAplicado, forma: 'sem-par', estorno: {} }], 'corretora').deltas).toEqual({})
  })
  it('lançamento ignorado não gera débito na conta nova (achado 3)', () => {
    const ignorado = { ...l('a', 100), isIgnored: true }
    expect(somarPrevia([{ l: ignorado, forma: 'sem-par', estorno: {} }], 'corretora').deltas).toEqual({})
  })
  it('conta os selecionados que já estão na conta nova (achado 4)', () => {
    const p = somarPrevia([
      { l: l('a', 100), forma: 'sem-par', estorno: {} },
      { l: { ...l('b', 100), accountId: 'corretora' }, forma: 'sem-par', estorno: {} },
    ], 'corretora', 'corretora')
    expect(p.naContaNova).toBe(1)
  })
})
