import { describe, it, expect } from 'vitest'
import { herancaDaPrevisao } from '../../conciliacao/heranca-da-previsao'

const PREV = { type: 'expense' as const, categoryId: 'psicologo' }
const REAL = {
  reviewState: 'confirmed' as const,
  type: 'expense' as const,
  categoryId: 'outras-saude',
  isAutoCategorized: true,
  transferGroupId: null,
}

describe('herancaDaPrevisao', () => {
  it('realizado pendente: a previsão classifica (natureza e categoria)', () => {
    expect(herancaDaPrevisao(PREV, { ...REAL, reviewState: 'pending', isAutoCategorized: false, categoryId: null })).toBe('classificar')
  })

  it('categoria automática (regra, contraparte, Polp): a da previsão substitui', () => {
    expect(herancaDaPrevisao(PREV, REAL)).toBe('substituir')
  })

  it('confirmado sem categoria: a da previsão entra', () => {
    expect(herancaDaPrevisao(PREV, { ...REAL, categoryId: null, isAutoCategorized: false })).toBe('substituir')
  })

  it('nunca troca por uma mais genérica: atual descendente da alvo fica (Assistente de limpeza ⊂ Casa)', () => {
    const casa = { ...PREV, categoryId: 'casa' }
    expect(herancaDaPrevisao(casa, { ...REAL, categoryId: 'assistente-limpeza' }, ['casa'])).toBeNull()
    expect(herancaDaPrevisao(casa, { ...REAL, categoryId: 'faxina-extra' }, ['assistente-limpeza', 'casa'])).toBeNull()
  })

  it('ida para mais específica continua trocando (Saúde → Psicólogo)', () => {
    expect(herancaDaPrevisao(PREV, { ...REAL, categoryId: 'saude' }, [])).toBe('substituir')
  })

  it('categoria escolhida à mão fica', () => {
    expect(herancaDaPrevisao(PREV, { ...REAL, isAutoCategorized: false })).toBeNull()
  })

  it('já na categoria da previsão: nada a fazer', () => {
    expect(herancaDaPrevisao(PREV, { ...REAL, categoryId: 'psicologo' })).toBeNull()
  })

  it('previsão sem categoria ou de transferência não classifica', () => {
    expect(herancaDaPrevisao({ ...PREV, categoryId: null }, REAL)).toBeNull()
    expect(herancaDaPrevisao({ type: 'transfer', categoryId: null }, { ...REAL, reviewState: 'pending' })).toBeNull()
  })

  it('realizado confirmado com outra natureza ou já ponta de transferência: não troca', () => {
    expect(herancaDaPrevisao(PREV, { ...REAL, type: 'income' })).toBeNull()
    expect(herancaDaPrevisao(PREV, { ...REAL, type: 'transfer', categoryId: null })).toBeNull()
    expect(herancaDaPrevisao(PREV, { ...REAL, transferGroupId: 'g1' })).toBeNull()
  })
})
