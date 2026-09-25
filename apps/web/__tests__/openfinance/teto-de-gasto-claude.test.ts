import { describe, it, expect, vi } from 'vitest'
import {
  comTeto,
  custoMicroUsd,
  LIMITE_MENSAL_MICRO_USD,
  OrcamentoDoClaudeEsgotado,
  type ControleDeGasto,
} from '@/lib/llm/teto-de-gasto'

function controle(gasto: number) {
  const registrar = vi.fn(async () => {})
  const c: ControleDeGasto = { gastoDoMes: async () => gasto, registrar }
  return { c, registrar }
}

describe('custoMicroUsd', () => {
  it('Opus 5: US$ 5 por milhão de tokens de entrada e US$ 25 de saída', () => {
    expect(custoMicroUsd('claude-opus-5', { input_tokens: 1_000_000, output_tokens: 0 })).toBe(5_000_000)
    expect(custoMicroUsd('claude-opus-5', { input_tokens: 6_000, output_tokens: 1_500 })).toBe(30_000 + 37_500)
  })
  it('cache: escrita custa 1,25x e leitura 0,1x da entrada', () => {
    expect(custoMicroUsd('claude-opus-5', { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000, cache_read_input_tokens: 1_000 })).toBe(6_250 + 500)
  })
  it('modelo sem preço conhecido é cobrado pelo mais caro, nunca de graça', () => {
    expect(custoMicroUsd('modelo-novo', { input_tokens: 1_000, output_tokens: 1_000 })).toBeGreaterThan(0)
  })
})

describe('comTeto', () => {
  it('o teto é US$ 0,50 por mês', () => {
    expect(LIMITE_MENSAL_MICRO_USD).toBe(500_000)
  })

  it('abaixo do teto chama e registra o custo', async () => {
    const { c, registrar } = controle(100_000)
    const r = await comTeto('org', c, async () => ({ resultado: 'ok', custoMicroUsd: 42_000 }))
    expect(r).toBe('ok')
    expect(registrar).toHaveBeenCalledWith('org', 42_000)
  })

  it('no teto não chama o Claude', async () => {
    const { c, registrar } = controle(500_000)
    const chamada = vi.fn(async () => ({ resultado: 'ok', custoMicroUsd: 1 }))
    await expect(comTeto('org', c, chamada)).rejects.toBeInstanceOf(OrcamentoDoClaudeEsgotado)
    expect(chamada).not.toHaveBeenCalled()
    expect(registrar).not.toHaveBeenCalled()
  })

  it('chamada que falha não registra custo', async () => {
    const { c, registrar } = controle(0)
    await expect(comTeto('org', c, async () => { throw new Error('timeout') })).rejects.toThrow('timeout')
    expect(registrar).not.toHaveBeenCalled()
  })
})
