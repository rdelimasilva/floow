import { describe, expect, it } from 'vitest'
import { faturasAPagar } from '@/lib/finance/fatura-a-pagar'

const fatura = (fechamento: string, vencimento: string, totalCents: number) =>
  ({ accountId: 'c1', accountName: 'Azul', fechamento, vencimento, totalCents })

const faturas = [fatura('2026-10-13', '2026-10-21', -1140718), fatura('2026-11-13', '2026-11-21', -1608337), fatura('2026-12-13', '2026-12-21', -389088)]

describe('faturasAPagar', () => {
  it('até o fechamento, mostra a aberta', () => {
    expect(faturasAPagar(faturas, [], '2026-11-13').get('c1')).toBe(-1608337)
  })

  it('entre o fechamento e o vencimento, sem pagamento, mostra a fechada', () => {
    expect(faturasAPagar(faturas, [], '2026-11-16').get('c1')).toBe(-1608337)
  })

  it('paga antes do vencimento, mostra a aberta', () => {
    const pago = [{ accountId: 'c1', date: '2026-11-18', amountCents: 1608337 }]
    expect(faturasAPagar(faturas, pago, '2026-11-18').get('c1')).toBe(-389088)
  })

  it('pagamento parcial não tira a fechada', () => {
    const pago = [{ accountId: 'c1', date: '2026-11-18', amountCents: 500000 }]
    expect(faturasAPagar(faturas, pago, '2026-11-18').get('c1')).toBe(-1608337)
  })

  it('depois do vencimento, mostra a aberta', () => {
    expect(faturasAPagar(faturas, [], '2026-11-22').get('c1')).toBe(-389088)
  })
})
