import { describe, expect, it } from 'vitest'
import { pagamentosDeFatura } from '@/lib/openfinance/pagamento-de-fatura'

/**
 * Agosto do Master Black: R$ 2.000 em 05/08 e R$ 1.000 em 08/08 pagos
 * antecipados. No cartão chegaram como "PAGAMENTO COM SALDO" e viraram
 * receita; na conta corrente, como "Pagamento de fatura".
 */

const credito = (id: string, amountCents: number, date: string) => ({ id, amountCents, date })
const saida = (id: string, amountCents: number, date: string) => ({ id, amountCents, date })

describe('pagamentosDeFatura', () => {
  it('reconhece pelo pagamento que o banco listou na fatura', () => {
    const achados = pagamentosDeFatura(
      [credito('c1', 200000, '2026-08-05')],
      [{ amountCents: 200000, date: '2026-08-05' }],
      [],
    )
    expect([...achados]).toEqual(['c1'])
  })

  it('reconhece pela saída da conta corrente, até 3 dias', () => {
    const achados = pagamentosDeFatura(
      [credito('c1', 100000, '2026-08-08')],
      [],
      [saida('s1', -100000, '2026-08-06')],
    )
    expect([...achados]).toEqual(['c1'])
  })

  it('saída a mais de 3 dias não serve', () => {
    expect(pagamentosDeFatura([credito('c1', 100000, '2026-08-08')], [], [saida('s1', -100000, '2026-08-02')]).size).toBe(0)
  })

  it('cada saída paga um crédito só: o estorno do mesmo valor fica receita', () => {
    const achados = pagamentosDeFatura(
      [credito('pagamento', 200000, '2026-08-05'), credito('estorno', 200000, '2026-08-07')],
      [{ amountCents: 200000, date: '2026-08-05' }],
      [saida('s1', -200000, '2026-08-05')],
    )
    expect([...achados]).toEqual(['pagamento'])
  })

  it('estorno sem pagamento correspondente continua receita', () => {
    expect(pagamentosDeFatura([credito('ml', 3878, '2026-07-11')], [], [saida('s1', -5579, '2026-07-11')]).size).toBe(0)
  })
})
