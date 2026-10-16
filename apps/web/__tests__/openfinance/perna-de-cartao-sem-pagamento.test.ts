import { describe, expect, it } from 'vitest'
import { pernasParaEfetivar } from '@/lib/openfinance/perna-de-cartao-sem-pagamento'

/**
 * Visa PDA, 16/10/2026: "Débito automático ITAU VISA PAO DE AC" (R$ 1.509,30)
 * saiu do Itaú pelo extrato; a regra da contraparte criou no Visa a perna que
 * aguarda o extrato do cartão. O extrato do Visa nunca traz pagamento.
 */
const perna = (id: string, parDoExtratoAplicado = true) => ({ id, parDoExtratoAplicado })

describe('pernasParaEfetivar', () => {
  it('cartão cujo extrato nunca trouxe pagamento: a perna entra no saldo', () => {
    expect(pernasParaEfetivar({ extratoTrazPagamento: false, pernas: [perna('visa')] })).toEqual(['visa'])
  })

  it('cartão cujo extrato traz pagamento: a perna espera o extrato', () => {
    // Master Black: "PAGAMENTO DEBITO AUTOMATICO" chega e absorve a perna.
    expect(pernasParaEfetivar({ extratoTrazPagamento: true, pernas: [perna('mb')] })).toEqual([])
  })

  it('a saída da outra conta ainda não está no saldo: a perna espera', () => {
    expect(pernasParaEfetivar({ extratoTrazPagamento: false, pernas: [perna('prevista', false)] })).toEqual([])
  })
})
