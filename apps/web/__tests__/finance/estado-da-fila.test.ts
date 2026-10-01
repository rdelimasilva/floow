import { describe, it, expect } from 'vitest'
import { faseDe, reduzir, soRestamPulados } from '@/components/finance/conciliar/estado-da-fila'

const it_ = (id: string, p: Record<string, unknown> = {}) =>
  ({ id, candidatas: [], repetido: null, classificacao: null, ...p }) as any
const cls = (counterpartyId: string) => ({ counterpartyId })

describe('faseDe', () => {
  it('repetido → candidatas → classificar', () => {
    expect(faseDe(it_('a', { repetido: {}, candidatas: [{}], classificacao: {} }))).toBe('repetido')
    expect(faseDe(it_('a', { candidatas: [{}], classificacao: {} }))).toBe('candidatas')
    expect(faseDe(it_('a', { classificacao: {} }))).toBe('classificar')
    expect(faseDe(it_('a'))).toBeNull()
  })
})

describe('reduzir', () => {
  const inicial = (itens: any[]) => ({ itens, pulados: [], feitos: 0 })
  it('resolvido tira o item e conta feito', () => {
    const e = reduzir(inicial([it_('a'), it_('b')]), { tipo: 'resolvido', id: 'a' })
    expect(e.itens.map((i) => i.id)).toEqual(['b'])
    expect(e.feitos).toBe(1)
  })
  it('"não é repetido" mantém o item na fase seguinte; sem mais nada, sai', () => {
    let e = reduzir(inicial([it_('a', { repetido: {}, classificacao: cls('x') })]), { tipo: 'semRepetido', id: 'a' })
    expect(faseDe(e.itens[0])).toBe('classificar')
    e = reduzir(inicial([it_('a', { repetido: {} })]), { tipo: 'semRepetido', id: 'a' })
    expect(e.itens).toEqual([])
  })
  it('"não é nenhum" leva de candidatas para classificar (Review Focus 2)', () => {
    const e = reduzir(inicial([it_('a', { candidatas: [{}], classificacao: cls('x') })]), { tipo: 'semVinculo', id: 'a' })
    expect(faseDe(e.itens[0])).toBe('classificar')
  })
  it('regra confirmada resolve os da mesma contraparte; quem tem candidata fica, já classificado', () => {
    const e = reduzir(
      inicial([it_('a', { classificacao: cls('net') }), it_('b', { classificacao: cls('net'), candidatas: [{}] }), it_('c', { classificacao: cls('uber') })]),
      { tipo: 'regraConfirmada', counterpartyId: 'net' },
    )
    expect(e.itens.map((i) => i.id)).toEqual(['b', 'c'])
    expect(e.itens[0].classificacao).toBeNull()
    expect(e.feitos).toBe(1)
  })
  it('pular manda para o fim; só pulados → oferece revisar', () => {
    let e = reduzir(inicial([it_('a'), it_('b')]), { tipo: 'pulado', id: 'a' })
    expect(e.itens.map((i) => i.id)).toEqual(['b', 'a'])
    e = reduzir(e, { tipo: 'pulado', id: 'b' })
    expect(soRestamPulados(e)).toBe(true)
    expect(soRestamPulados(reduzir(e, { tipo: 'revisarPulados' }))).toBe(false)
  })
})
