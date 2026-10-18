import { describe, it, expect } from 'vitest'
import { proximasAVencer } from '@/lib/finance/proximas-a-vencer'

/**
 * "Próximas a vencer" olhava `next_due_date` do template, que aponta para um
 * período DEPOIS da última parcela (as parcelas nascem todas na criação).
 * Com séries de 61 parcelas ele fica em 2031 e a seção dizia "nenhuma
 * pendente" com parcelas em 20/10, 22/10 e 30/10 (revisão de 18/10/2026).
 * A seção agora olha a próxima parcela em aberto de cada recorrência.
 */
const hoje = '2026-10-18'
const base = { isActive: true, nextDueDate: '2031-05-15T00:00:00.000Z' }

describe('próximas a vencer', () => {
  it('mostra a recorrência cuja próxima parcela cai nos próximos 30 dias, em ordem de data', () => {
    const lista = proximasAVencer([
      { ...base, id: 'tim', proximaParcela: '2026-10-22' },
      { ...base, id: 'livelo', proximaParcela: '2026-10-20' },
      { ...base, id: 'flavio', proximaParcela: '2026-11-01' },
    ], hoje)
    expect(lista.map((t) => t.id)).toEqual(['livelo', 'tim', 'flavio'])
  })

  it('parcela de hoje entra; a de daqui a mais de 30 dias não', () => {
    const lista = proximasAVencer([
      { ...base, id: 'hoje', proximaParcela: hoje },
      { ...base, id: 'longe', proximaParcela: '2026-11-18' },
    ], hoje)
    expect(lista.map((t) => t.id)).toEqual(['hoje'])
  })

  it('pausada ou sem parcela em aberto fica de fora', () => {
    const lista = proximasAVencer([
      { ...base, id: 'pausada', isActive: false, proximaParcela: '2026-10-20' },
      { ...base, id: 'acabou', proximaParcela: null },
    ], hoje)
    expect(lista).toEqual([])
  })
})
