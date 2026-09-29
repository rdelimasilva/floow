import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * As três filas viraram seções de /transactions/conciliar. As rotas antigas
 * ficam para links salvos, WhatsApp e e-mails já enviados, e levam direto à
 * seção certa.
 */

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`)
})
vi.mock('next/navigation', () => ({ redirect }))

const { default: ReviewPage } = await import('@/app/(app)/transactions/review/page')
const { default: MatchesPage } = await import('@/app/(app)/transactions/matches/page')
const { default: DuplicatesPage } = await import('@/app/(app)/transactions/duplicates/page')

beforeEach(() => { redirect.mockClear() })

describe('rotas antigas das filas', () => {
  it('Classificar vai para #classificar', async () => {
    await expect(ReviewPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/transactions/conciliar#classificar')
  })

  it('Classificar preserva ?regra= ("Corrigir regra" de links antigos)', async () => {
    await expect(ReviewPage({ searchParams: Promise.resolve({ regra: 'cp-1' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/transactions/conciliar?regra=cp-1#classificar')
  })

  it('?regra= vazio não vira parâmetro vazio, e o id sai codificado', async () => {
    await expect(ReviewPage({ searchParams: Promise.resolve({ regra: '' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenLastCalledWith('/transactions/conciliar#classificar')

    await expect(ReviewPage({ searchParams: Promise.resolve({ regra: 'a b&c' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenLastCalledWith('/transactions/conciliar?regra=a%20b%26c#classificar')
  })

  it('Confirmar previsões vai para #confirmar', () => {
    expect(() => MatchesPage()).toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/transactions/conciliar#confirmar')
  })

  it('Remover repetidos vai para #repetidos', () => {
    expect(() => DuplicatesPage()).toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/transactions/conciliar#repetidos')
  })
})
