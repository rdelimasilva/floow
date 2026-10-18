import { agruparPorBloco, type AccountType } from './account-types'

/**
 * Regra única do patrimônio: a da tela Contas.
 *
 * O Dashboard lia um snapshot gravado só quando alguém clicava em "Atualizar
 * valores", calculado com regra própria — somava o saldo da conta de
 * investimento E as posições por cima, chamava a soma das posições de
 * "investments" e tratava cartão com crédito a favor como dívida
 * (`Math.abs`). Resultado: duas telas com dois patrimônios. Aqui fica a conta
 * que as duas usam, e o snapshot passa a gravar este mesmo número.
 */

type ContaDoPatrimonio = { id: string; type: AccountType; balanceCents: number }

/**
 * Conta de investimentos do Open Finance vale o que as posições valem, não o
 * saldo de lançamentos (zerado numa conexão só de investimentos, ou inflado
 * pelas aplicações que passaram pelo extrato). As demais valem o saldo.
 */
export function valorDaConta(conta: { id: string; balanceCents: number }, valorDasPosicoes: Map<string, number>): number {
  return valorDasPosicoes.get(conta.id) ?? conta.balanceCents
}

export interface BlocoDoPatrimonio {
  key: string
  titulo: string
  valorCents: number
}

export interface Patrimonio {
  patrimonioLiquidoCents: number
  /** Tudo que tem valor positivo: saldo, posições, crédito a favor, imobilizado. */
  ativosCents: number
  /** Tudo que tem valor negativo, em módulo: fatura de cartão, cheque especial. */
  passivosCents: number
  /** Mesmos blocos da tela Contas, mais o imobilizado. Somam o líquido. */
  blocos: BlocoDoPatrimonio[]
}

export function calcularPatrimonio(
  contas: ContaDoPatrimonio[],
  valorDasPosicoes: Map<string, number>,
  imobilizadoCents: number = 0,
): Patrimonio {
  let ativosCents = 0
  let passivosCents = 0
  for (const conta of contas) {
    const valor = valorDaConta(conta, valorDasPosicoes)
    if (valor >= 0) ativosCents += valor
    else passivosCents += -valor
  }

  const blocos: BlocoDoPatrimonio[] = agruparPorBloco(contas).map((b) => ({
    key: b.key,
    titulo: b.titulo,
    valorCents: b.contas.reduce((sum, c) => sum + valorDaConta(c, valorDasPosicoes), 0),
  }))

  if (imobilizadoCents > 0) {
    ativosCents += imobilizadoCents
    blocos.push({ key: 'imobilizado', titulo: 'Imobilizado', valorCents: imobilizadoCents })
  }

  return {
    patrimonioLiquidoCents: ativosCents - passivosCents,
    ativosCents,
    passivosCents,
    blocos,
  }
}
