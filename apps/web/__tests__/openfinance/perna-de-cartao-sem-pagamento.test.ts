import { describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import { transactions } from '@floow/db'
import { PAR_DO_EXTRATO_APLICADO, pernasParaEfetivar } from '@/lib/openfinance/perna-de-cartao-sem-pagamento'

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

describe('PAR_DO_EXTRATO_APLICADO', () => {
  // Com `${coluna}` o Drizzle escrevia "account_id" sem a tabela, e o par era
  // comparado com ele mesmo: a regra foi ao ar e não achou o débito do Itaú.
  it('compara o par com a linha da consulta, não com ele mesmo', () => {
    const texto = drizzle.mock()
      .select({ id: transactions.id, par: PAR_DO_EXTRATO_APLICADO })
      .from(transactions)
      .toSQL().sql
    expect(texto).toContain('par.transfer_group_id = "transactions"."transfer_group_id"')
    expect(texto).toContain('par.account_id <> "transactions"."account_id"')
  })
})
