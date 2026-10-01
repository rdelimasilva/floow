import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * As três filas viraram o modo foco em /transactions/conciliar, com Regras
 * em /transactions/conciliar/regras. As rotas antigas ficam para links
 * salvos, WhatsApp e e-mails já enviados.
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
  it('Classificar vai para /transactions/conciliar', async () => {
    await expect(ReviewPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/transactions/conciliar')
  })

  it('Classificar com ?regra= vai direto para a regra em Regras', async () => {
    await expect(ReviewPage({ searchParams: Promise.resolve({ regra: 'cp-1' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/transactions/conciliar/regras?regra=cp-1')
  })

  it('?regra= vazio não vira parâmetro vazio, e o id sai codificado', async () => {
    await expect(ReviewPage({ searchParams: Promise.resolve({ regra: '' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenLastCalledWith('/transactions/conciliar')

    await expect(ReviewPage({ searchParams: Promise.resolve({ regra: 'a b&c' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenLastCalledWith('/transactions/conciliar/regras?regra=a%20b%26c')
  })

  it('Confirmar previsões vai para /transactions/conciliar', () => {
    expect(() => MatchesPage()).toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/transactions/conciliar')
  })

  it('Remover repetidos vai para /transactions/conciliar', () => {
    expect(() => DuplicatesPage()).toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/transactions/conciliar')
  })
})
