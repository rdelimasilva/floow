import { describe, it, expect } from 'vitest'
import { posicaoVigente, type LeituraDoBanco } from '@/lib/investments/posicao-vigente'

/**
 * Caso real (XP, 19/10/2026): o sync trouxe, com data de domingo 18/10, saldo
 * zero em todos os títulos do Tesouro — R$ 444 mil a menos na conta — sem
 * venda nem resgate. Em todo o histórico até ali, nenhum zero do banco depois
 * de saldo tinha venda, resgate ou vencimento por trás; três voltaram sozinhos.
 */

const leitura = (referenceDate: string, quantity: number, netCents: number): LeituraDoBanco => ({
  referenceDate, quantity, grossCents: netCents, netCents, purchaseUnitPrice: 862.76, origem: 'banco',
})
const zeroDoBanco = (d: string) => leitura(d, 0, 0)
const zeroDeAusencia = (d: string): LeituraDoBanco => ({ ...leitura(d, 0, 0), origem: 'ausencia' })

const comSaldo = leitura('2026-10-15', 384.44, 34016789)
const semProva = { vencimento: '2035-01-01', saidas: [] as string[] }

describe('posicaoVigente', () => {
  it('zero do banco sem venda, resgate nem vencimento mantém a última posição com saldo', () => {
    expect(posicaoVigente([zeroDoBanco('2026-10-18'), comSaldo], semProva)?.netCents).toBe(34016789)
  })

  it('zero repetido por menos de 7 dias continua sem prova', () => {
    const p = posicaoVigente([zeroDoBanco('2026-10-23'), zeroDoBanco('2026-10-18'), comSaldo], semProva)
    expect(p?.netCents).toBe(34016789)
  })

  it('zero que o banco sustenta por 7 dias vale', () => {
    const p = posicaoVigente([zeroDoBanco('2026-10-25'), zeroDoBanco('2026-10-18'), comSaldo], semProva)
    expect(p?.netCents).toBe(0)
  })

  it('venda ou resgate desde a última posição com saldo zera na hora', () => {
    expect(posicaoVigente([zeroDoBanco('2026-10-18'), comSaldo], { ...semProva, saidas: ['2026-10-16'] })?.netCents).toBe(0)
  })

  it('a folga de 3 dias cobre a posição que chega atrasada em relação à venda', () => {
    expect(posicaoVigente([zeroDoBanco('2026-10-18'), comSaldo], { ...semProva, saidas: ['2026-10-12'] })?.netCents).toBe(0)
  })

  it('venda antiga, anterior à posição com saldo, não prova o zero', () => {
    expect(posicaoVigente([zeroDoBanco('2026-10-18'), comSaldo], { ...semProva, saidas: ['2026-10-01'] })?.netCents).toBe(34016789)
  })

  it('título vencido zera', () => {
    expect(posicaoVigente([zeroDoBanco('2026-10-18'), comSaldo], { ...semProva, vencimento: '2026-10-17' })?.netCents).toBe(0)
  })

  it('zero de ausência na listagem vale na hora (cópia descartada, papel que saiu)', () => {
    expect(posicaoVigente([zeroDeAusencia('2026-10-19'), comSaldo], semProva)?.netCents).toBe(0)
  })

  it('posição com saldo mais nova vale', () => {
    const p = posicaoVigente([leitura('2026-10-18', 10, 1368796), leitura('2026-10-15', 10, 1360000)], semProva)
    expect(p?.netCents).toBe(1368796)
  })

  it('ativo que nunca teve saldo fica zerado', () => {
    expect(posicaoVigente([zeroDoBanco('2026-10-18')], semProva)?.netCents).toBe(0)
  })

  it('sem leitura nenhuma devolve null', () => {
    expect(posicaoVigente([], semProva)).toBeNull()
  })
})
