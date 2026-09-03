import { describe, expect, it } from 'vitest'
import { normalizeBatch } from '@/lib/openfinance/normalize-batch'
import { normalizeCardTransaction, type PolpCardTransaction } from '@floow/core-finance'

/**
 * Em produção ninguém vai olhar o payload de cada instituição para descobrir o
 * que veio diferente. Uma transação que a ingestão não entende não pode levar
 * as outras 499 da página junto — e não pode desaparecer sem deixar rastro.
 */

function cardTx(overrides: Partial<PolpCardTransaction> = {}): PolpCardTransaction {
  return {
    id: 'ctx-1',
    credit_card_id: 'card-1',
    identification_number: '1234',
    transaction_name: 'COMPRA',
    credit_debit_type: 'DEBITO',
    transaction_type: 'PAGAMENTO',
    brazilian_amount: { amount: '59.90', currency: 'BRL' },
    amount: { amount: '59.90', currency: 'BRL' },
    transaction_date_time: '2026-09-02T20:00:00-03:00',
    bill_post_date: '2026-09-10',
    bill_forecast_date: '2026-09',
    counterparty: null,
    category_ref: 'ENTERTAINMENT_TV_AND_MOVIES',
    created_at: '2026-09-02T21:00:00-03:00',
    updated_at: '2026-09-02T21:00:00-03:00',
    ...overrides,
  }
}

describe('normalizeBatch', () => {
  it('deixa passar o lote inteiro quando tudo está bem', () => {
    const { ok, rejected } = normalizeBatch(
      [cardTx({ id: 'a' }), cardTx({ id: 'b' })],
      normalizeCardTransaction,
    )

    expect(ok).toHaveLength(2)
    expect(rejected).toEqual([])
  })

  it('salva as boas quando uma vem com valor ilegível', () => {
    // O caso que derrubava a página: `page.map()` levava as outras junto.
    const { ok, rejected } = normalizeBatch(
      [
        cardTx({ id: 'boa-1' }),
        cardTx({ id: 'ruim', brazilian_amount: { amount: 'R$ 1.500,00', currency: 'BRL' } }),
        cardTx({ id: 'boa-2' }),
      ],
      normalizeCardTransaction,
    )

    expect(ok.map((t) => t.externalId)).toEqual(['boa-1', 'boa-2'])
    expect(rejected).toHaveLength(1)
  })

  it('registra o id, o motivo e o payload cru do que rejeitou', () => {
    // Sem os três, "faltou uma transação no meu extrato" é indebugável.
    const ruim = cardTx({ id: 'ruim', transaction_date_time: 'ontem' })
    const { rejected } = normalizeBatch([ruim], normalizeCardTransaction)

    expect(rejected[0].externalId).toBe('ruim')
    expect(rejected[0].reason).toMatch(/data inválida/i)
    expect(rejected[0].raw).toBe(ruim)
  })

  it('não engasga com payload sem id reconhecível', () => {
    const { rejected } = normalizeBatch([{ foo: 'bar' }], () => {
      throw new Error('formato desconhecido')
    })

    expect(rejected[0].externalId).toBeNull()
    expect(rejected[0].raw).toEqual({ foo: 'bar' })
  })

  it('aceita lote vazio', () => {
    expect(normalizeBatch([], normalizeCardTransaction)).toEqual({ ok: [], rejected: [] })
  })
})
