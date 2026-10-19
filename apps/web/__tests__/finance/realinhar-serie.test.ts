import { describe, it, expect } from 'vitest'
import { dataRealinhada, planejarRealinhamento } from '@/lib/finance/conciliacao/realinhar-serie'

/**
 * Quando o usuário liga uma previsão de recorrência ao lançamento do banco,
 * o dia em que o banco cobrou vira o dia da série. Sem isso a recorrência
 * cadastrada no dia 1 e cobrada no dia 16 nunca casa sozinha (janela de 7
 * dias) e conta em dobro todo mês (Livelo, 10/2026).
 */
describe('dataRealinhada — mensal, trimestral, anual', () => {
  it('leva a parcela para o dia em que o banco cobrou', () => {
    expect(dataRealinhada('2026-10-01', '2026-09-15', '2026-09-16', 'monthly')).toBe('2026-10-16')
  })

  it('cobrança que virou o mês empurra as próximas para o mês seguinte', () => {
    // Previsto 30/09, pago 01/10: a parcela de 30/10 vai para 01/11, não 01/10.
    expect(dataRealinhada('2026-10-30', '2026-09-30', '2026-10-01', 'monthly')).toBe('2026-11-01')
  })

  it('cobrança adiantada para o mês anterior puxa as próximas', () => {
    expect(dataRealinhada('2026-11-01', '2026-10-01', '2026-09-28', 'monthly')).toBe('2026-10-28')
  })

  it('pagamento atrasado para o mês seguinte não empurra a série um mês', () => {
    // Parcela de 01/12 paga em 01/01: dezembro de 2026 continua em 01/12.
    expect(dataRealinhada('2026-12-01', '2025-12-01', '2026-01-01', 'monthly')).toBe('2026-12-01')
    // Previsto 01/12, pago 05/01: só o dia muda.
    expect(dataRealinhada('2026-12-01', '2025-12-01', '2026-01-05', 'monthly')).toBe('2026-12-05')
  })

  it('dia que não existe no mês fica no último dia, sem arrastar os seguintes', () => {
    expect(dataRealinhada('2027-02-10', '2026-10-10', '2026-10-31', 'monthly')).toBe('2027-02-28')
    expect(dataRealinhada('2027-03-10', '2026-10-10', '2026-10-31', 'monthly')).toBe('2027-03-31')
  })

  it('trimestral e anual mantêm o mês de cada parcela', () => {
    expect(dataRealinhada('2027-01-05', '2026-10-05', '2026-10-12', 'quarterly')).toBe('2027-01-12')
    expect(dataRealinhada('2027-10-05', '2026-10-05', '2026-10-12', 'yearly')).toBe('2027-10-12')
  })
})

describe('dataRealinhada — diária, semanal, quinzenal', () => {
  it('anda os mesmos dias que a cobrança andou', () => {
    expect(dataRealinhada('2026-10-15', '2026-10-08', '2026-10-10', 'weekly')).toBe('2026-10-17')
    expect(dataRealinhada('2026-10-22', '2026-10-08', '2026-10-06', 'biweekly')).toBe('2026-10-20')
    expect(dataRealinhada('2026-10-31', '2026-10-30', '2026-11-01', 'daily')).toBe('2026-11-02')
  })
})

describe('planejarRealinhamento', () => {
  const p = (id: string, data: string) => ({ id, accountId: 'c', data })
  const umMes = (d: string) => dataRealinhada(d, '2026-09-30', '2026-10-01', 'monthly')

  it('empurrando para frente, grava a mais tarde primeiro', () => {
    const serie = [p('nov', '2026-11-01'), p('dez', '2026-12-01')]
    const r = planejarRealinhamento(serie, serie, (d) => dataRealinhada(d, '2026-10-15', '2026-10-16', 'monthly'))
    expect(r?.map((m) => m.nova)).toEqual(['2026-11-16', '2026-12-16'])
    const empurrar = planejarRealinhamento(serie, serie, (d) => (d === '2026-11-01' ? '2026-12-01' : '2027-01-01'))
    expect(empurrar?.map((m) => m.id)).toEqual(['dez', 'nov'])
  })

  it('duas parcelas no mesmo dia no fim: não realinha', () => {
    const pendentes = [p('a', '2026-11-30')]
    const serie = [...pendentes, p('fixa', '2026-12-01')]
    expect(planejarRealinhamento(pendentes, serie, umMes)).toBeNull()
  })

  it('nada muda: lista vazia', () => {
    expect(planejarRealinhamento([p('a', '2026-11-01')], [p('a', '2026-11-01')], (d) => d)).toEqual([])
  })
})
