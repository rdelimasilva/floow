import { describe, it, expect } from 'vitest'
import { calcularPatrimonio, valorDaConta } from '@/lib/finance/patrimonio'

/**
 * O patrimônio do Dashboard tem de fechar com a tela Contas.
 *
 * Antes ele lia um snapshot gravado à mão (o do usuário era de 06/10), com
 * regra própria: somava o saldo da conta de investimento E as posições,
 * rotulava a soma das posições como "investments" em inglês, e tratava saldo
 * positivo de cartão como passivo pelo valor absoluto. Os números abaixo são
 * os da revisão de 18/10/2026: Contas mostrava R$ 664.346,39 e cartões
 * R$ 5.078,41 enquanto o Dashboard dizia R$ 613.332 e R$ 13.716.
 */
const contas = [
  { id: 'itau', type: 'checking' as const, balanceCents: 1669490 },
  { id: 'nubank', type: 'checking' as const, balanceCents: 0 },
  // Saldo de lançamentos que não vale nada: a conta vale as posições.
  { id: 'inv-itau', type: 'brokerage' as const, balanceCents: 10485834 },
  { id: 'inv-nubank', type: 'brokerage' as const, balanceCents: 401643 },
  { id: 'inv-xp', type: 'brokerage' as const, balanceCents: 0 },
  { id: 'visa', type: 'credit_card' as const, balanceCents: -35605 },
  { id: 'master', type: 'credit_card' as const, balanceCents: -472236 },
]
const posicoes = new Map([
  ['inv-itau', 190502],
  ['inv-nubank', 0],
  ['inv-xp', 65082488],
])

describe('valorDaConta', () => {
  it('conta de investimento do Open Finance vale as posições, não o saldo', () => {
    expect(valorDaConta(contas[2], posicoes)).toBe(190502)
    expect(valorDaConta(contas[3], posicoes)).toBe(0)
    expect(valorDaConta(contas[4], posicoes)).toBe(65082488)
  })

  it('as demais contas valem o saldo', () => {
    expect(valorDaConta(contas[0], posicoes)).toBe(1669490)
    expect(valorDaConta(contas[5], posicoes)).toBe(-35605)
  })
})

describe('calcularPatrimonio', () => {
  it('fecha com o "Patrimônio total" da tela Contas', () => {
    const p = calcularPatrimonio(contas, posicoes)
    expect(p.patrimonioLiquidoCents).toBe(66434639)
  })

  it('passivo é a dívida dos cartões, e ativo menos passivo dá o líquido', () => {
    const p = calcularPatrimonio(contas, posicoes)
    expect(p.passivosCents).toBe(507841)
    expect(p.ativosCents).toBe(1669490 + 190502 + 65082488)
    expect(p.ativosCents - p.passivosCents).toBe(p.patrimonioLiquidoCents)
  })

  it('detalha pelos mesmos blocos da tela Contas, em português, sem contar duas vezes', () => {
    const p = calcularPatrimonio(contas, posicoes)
    expect(p.blocos).toEqual([
      { key: 'correntes', titulo: 'Contas correntes', valorCents: 1669490 },
      { key: 'investimentos', titulo: 'Investimentos', valorCents: 65272990 },
      { key: 'cartoes', titulo: 'Cartões', valorCents: -507841 },
    ])
    const soma = p.blocos.reduce((s, b) => s + b.valorCents, 0)
    expect(soma).toBe(p.patrimonioLiquidoCents)
  })

  it('cartão com crédito a favor é ativo, não passivo', () => {
    // O snapshot fazia Math.abs: R$ 100 a favor no cartão virava R$ 100 de dívida.
    const p = calcularPatrimonio([{ id: 'c', type: 'credit_card', balanceCents: 10000 }], new Map())
    expect(p.passivosCents).toBe(0)
    expect(p.ativosCents).toBe(10000)
    expect(p.patrimonioLiquidoCents).toBe(10000)
  })

  it('imobilizado entra como bloco próprio, somando no ativo', () => {
    const p = calcularPatrimonio([{ id: 'a', type: 'checking', balanceCents: 1000 }], new Map(), 50000)
    expect(p.blocos.at(-1)).toEqual({ key: 'imobilizado', titulo: 'Imobilizado', valorCents: 50000 })
    expect(p.ativosCents).toBe(51000)
    expect(p.patrimonioLiquidoCents).toBe(51000)
  })
})
