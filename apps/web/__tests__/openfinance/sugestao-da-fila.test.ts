import { describe, it, expect, vi } from 'vitest'
import {
  sugerirCategoriasDaFila,
  type SugestaoDaFilaDeps,
  type GrupoPendente,
} from '@/lib/openfinance/sugestao-da-fila'

/**
 * A fila "Classificar lançamentos" chega com a categoria pré-selecionada:
 * histórico primeiro, Claude depois. Nada é confirmado sozinho — o teste de
 * 24/09/2026 contra as escolhas do usuário mostrou 6 erros em 8.
 */
const CATS = [
  { id: 'hosp', name: 'Hospedagem', parentId: null, polpRef: null, type: 'expense' as const },
  { id: 'saude', name: 'Saúde', parentId: null, polpRef: null, type: 'expense' as const },
  { id: 'beleza', name: 'Cabelo e beleza', parentId: null, polpRef: null, type: 'expense' as const },
  { id: 'juridico', name: 'Consultoria e serviços jurídicos', parentId: null, polpRef: null, type: 'expense' as const },
  { id: 'outros', name: 'Outros', parentId: null, polpRef: 'OTHER', type: 'expense' as const },
  { id: 'salario', name: 'Salário', parentId: null, polpRef: null, type: 'income' as const },
]

function grupo(over: Partial<GrupoPendente>): GrupoPendente {
  return {
    counterpartyId: 'cp', displayName: 'AIRBNB', keyType: 'description', keyValue: 'AIRBNB',
    nature: 'expense', descricoes: ['AIRBNB * HMR5'], count: 1, totalCents: -50_000, ...over,
  }
}

function deps(over: Partial<SugestaoDaFilaDeps> = {}) {
  const sugerir = vi.fn(async () => {})
  const marcarTentativa = vi.fn(async () => {})
  const d: SugestaoDaFilaDeps = {
    carregarPendentes: async () => [],
    carregarHistorico: async () => [],
    carregarCategorias: async () => CATS,
    sugerir,
    marcarTentativa,
    ...over,
  }
  return { d, sugerir, marcarTentativa }
}

describe('sugerirCategoriasDaFila', () => {
  it('histórico da pessoa pelo nome completo sugere sem chamar o Claude', async () => {
    const classificar = vi.fn(async () => [])
    const { d, sugerir, marcarTentativa } = deps({
      carregarPendentes: async () => [grupo({ counterpartyId: 'flavio', displayName: 'FLAVIO ACCURSIO', keyType: 'tax_id', keyValue: '12345678901' })],
      carregarHistorico: async () => [
        { description: 'Pix enviado Flavio Accursio', categoryId: 'saude' },
        { description: 'PIX FLAVIO ACCURSIO', categoryId: 'saude' },
      ],
      classificar,
    })
    const r = await sugerirCategoriasDaFila('org', d)
    expect(sugerir).toHaveBeenCalledWith('org', { counterpartyId: 'flavio', categoryId: 'saude', origem: 'historico' })
    expect(classificar).not.toHaveBeenCalled()
    expect(marcarTentativa).toHaveBeenCalledWith('org', ['flavio'])
    expect(r).toEqual({ sugeridas: 1, semSugestao: 0 })
  })

  it('pessoa só casa pelo nome completo: outro Mauricio não decide', async () => {
    const { d, sugerir } = deps({
      carregarPendentes: async () => [grupo({ counterpartyId: 'm', displayName: 'MAURICIO DE OLIVEIRA', keyType: 'tax_id', keyValue: '11122233344' })],
      carregarHistorico: async () => [
        { description: 'Pix enviado Mauricio Bastos', categoryId: 'juridico' },
        { description: 'Pix enviado Mauricio Bastos', categoryId: 'juridico' },
      ],
      classificar: async () => [],
    })
    await sugerirCategoriasDaFila('org', d)
    expect(sugerir).not.toHaveBeenCalled()
  })

  it('Claude sugere com confiança alta ou média; baixa fica sem sugestão', async () => {
    const { d, sugerir, marcarTentativa } = deps({
      carregarPendentes: async () => [
        grupo({ counterpartyId: 'airbnb' }),
        grupo({ counterpartyId: 'loja', displayName: 'LOJA XYZ' }),
        grupo({ counterpartyId: 'vago', displayName: 'MAREE PAGAMENTOS' }),
      ],
      classificar: async () => [
        { counterpartyId: 'airbnb', categoryId: 'hosp', confianca: 'alta' as const },
        { counterpartyId: 'loja', categoryId: 'hosp', confianca: 'media' as const },
        { counterpartyId: 'vago', categoryId: 'hosp', confianca: 'baixa' as const },
      ],
    })
    const r = await sugerirCategoriasDaFila('org', d)
    expect(sugerir).toHaveBeenCalledTimes(2)
    expect(sugerir).toHaveBeenCalledWith('org', { counterpartyId: 'airbnb', categoryId: 'hosp', origem: 'claude' })
    expect(marcarTentativa).toHaveBeenCalledWith('org', expect.arrayContaining(['airbnb', 'loja', 'vago']))
    expect(r).toEqual({ sugeridas: 2, semSugestao: 1 })
  })

  it('Claude não pode sugerir categoria inventada, genérica ou do tipo errado', async () => {
    const { d, sugerir } = deps({
      carregarPendentes: async () => [grupo({ counterpartyId: 'a' }), grupo({ counterpartyId: 'b' }), grupo({ counterpartyId: 'c' })],
      classificar: async () => [
        { counterpartyId: 'a', categoryId: 'nao-existe', confianca: 'alta' as const },
        { counterpartyId: 'b', categoryId: 'outros', confianca: 'alta' as const },
        { counterpartyId: 'c', categoryId: 'salario', confianca: 'alta' as const },
      ],
    })
    await sugerirCategoriasDaFila('org', d)
    expect(sugerir).not.toHaveBeenCalled()
  })

  it('transferência e natureza misturada não recebem sugestão', async () => {
    const classificar = vi.fn(async () => [])
    const { d, sugerir, marcarTentativa } = deps({
      carregarPendentes: async () => [grupo({ counterpartyId: 't', nature: null })],
      classificar,
    })
    await sugerirCategoriasDaFila('org', d)
    expect(sugerir).not.toHaveBeenCalled()
    expect(classificar).not.toHaveBeenCalled()
    expect(marcarTentativa).toHaveBeenCalledWith('org', ['t'])
  })

  it('pessoa física sem histórico não vai para o Claude', async () => {
    const classificar = vi.fn(async () => [])
    const { d } = deps({
      carregarPendentes: async () => [grupo({ counterpartyId: 'maraisa', displayName: 'MARAISA RAMOS', keyType: 'tax_id', keyValue: '98765432100' })],
      classificar,
    })
    await sugerirCategoriasDaFila('org', d)
    expect(classificar).not.toHaveBeenCalled()
  })

  it('sem chave do Claude ou com Claude fora do ar, o que dependia dele espera a próxima importação', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const classificar of [undefined, async () => { throw new Error('timeout') }]) {
      const { d, sugerir, marcarTentativa } = deps({ carregarPendentes: async () => [grupo({ counterpartyId: 'airbnb' })], classificar })
      const r = await sugerirCategoriasDaFila('org', d)
      expect(sugerir).not.toHaveBeenCalled()
      expect(marcarTentativa).not.toHaveBeenCalled()
      expect(r).toEqual({ sugeridas: 0, semSugestao: 1 })
    }
    err.mockRestore()
  })

  it('teto de gasto atingido: segue sem o Claude, sem marcar tentativa, só com aviso', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const esgotado = Object.assign(new Error('Teto mensal de gasto com o Claude atingido para org=org'), { name: 'OrcamentoDoClaudeEsgotado' })
    const { d, sugerir, marcarTentativa } = deps({
      carregarPendentes: async () => [grupo({ counterpartyId: 'airbnb' })],
      classificar: async () => { throw esgotado },
    })
    await sugerirCategoriasDaFila('org', d)
    expect(sugerir).not.toHaveBeenCalled()
    expect(marcarTentativa).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    expect(err).not.toHaveBeenCalled()
    warn.mockRestore()
    err.mockRestore()
  })

  it('sem pendentes, não carrega mais nada', async () => {
    const carregarHistorico = vi.fn(async () => [])
    const { d } = deps({ carregarHistorico })
    expect(await sugerirCategoriasDaFila('org', d)).toEqual({ sugeridas: 0, semSugestao: 0 })
    expect(carregarHistorico).not.toHaveBeenCalled()
  })
})
