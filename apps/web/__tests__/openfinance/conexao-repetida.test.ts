import { describe, expect, it } from 'vitest'
import { produtosJaConectados } from '@/lib/openfinance/conexao-repetida'

describe('produtosJaConectados', () => {
  it('sem conexão viva no banco: nada repete', () => {
    expect(produtosJaConectados([], ['ACCOUNT'])).toEqual([])
  })

  it('conexão de conta e cartão aceita outra só de investimentos', () => {
    expect(produtosJaConectados([{ products: ['ACCOUNT', 'CREDIT_CARD_ACCOUNT'] }], ['INVESTMENTS'])).toEqual([])
  })

  it('produto que já está numa conexão viva repete', () => {
    expect(produtosJaConectados([{ products: ['ACCOUNT', 'CREDIT_CARD_ACCOUNT'] }], ['ACCOUNT', 'INVESTMENTS']))
      .toEqual(['ACCOUNT'])
  })

  it('olha todas as conexões vivas do par CPF + banco', () => {
    const existentes = [{ products: ['ACCOUNT'] }, { products: ['INVESTMENTS'] }]
    expect(produtosJaConectados(existentes, ['INVESTMENTS'])).toEqual(['INVESTMENTS'])
  })

  it('conexão sem produtos gravados conta como tudo: não dá para saber o que ela cobre', () => {
    expect(produtosJaConectados([{ products: null }], ['INVESTMENTS'])).toEqual(['INVESTMENTS'])
  })
})
