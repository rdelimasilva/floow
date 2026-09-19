import { describe, it, expect } from 'vitest'
import { contasParaLancamento, semContasDeInvestimento } from '@/lib/finance/account-options'

/**
 * Conta de investimento nao pode ser escolhida num lancamento.
 *
 * Um aporte nasce na conta corrente e vira transferencia; a perna da
 * corretora e consequencia, nao algo que se digita. Oferecer a corretora no
 * seletor convida a criar despesa e receita direto nela, que e como o saldo
 * daquela conta chegou a -R$ 69.770,47 nos dados reais.
 *
 * `getAccounts` continua devolvendo tudo: ele alimenta as telas de contas,
 * patrimonio e investimentos, onde a corretora PRECISA aparecer. O corte e
 * aqui, no ponto de uso das telas de transacao.
 */

const CONTAS = [
  { id: 'a1', name: 'Itau Corrente', type: 'checking' },
  { id: 'a2', name: 'Nubank', type: 'credit_card' },
  { id: 'a3', name: 'XP Corretora', type: 'brokerage' },
  { id: 'a4', name: 'Poupanca', type: 'savings' },
]

describe('contasParaLancamento', () => {
  it('tira a corretora', () => {
    const nomes = contasParaLancamento(CONTAS).map((c) => c.name)
    expect(nomes).not.toContain('XP Corretora')
  })

  it('mantem corrente, cartao e poupanca', () => {
    const nomes = contasParaLancamento(CONTAS).map((c) => c.name)
    expect(nomes).toEqual(['Itau Corrente', 'Nubank', 'Poupanca'])
  })

  it('devolve so id e nome, o formato que os seletores esperam', () => {
    expect(contasParaLancamento([CONTAS[0]])).toEqual([{ id: 'a1', name: 'Itau Corrente' }])
  })
})

/**
 * `TransactionForm` e `ImportForm` recebem a conta inteira, nao `{id, name}`.
 * O filtro generico existe para elas — e precisa preservar todos os campos,
 * senao o formulario perde tipo, saldo e moeda da conta.
 */
describe('semContasDeInvestimento', () => {
  it('tira a corretora preservando o objeto inteiro', () => {
    const contas = [
      { id: 'a1', name: 'Itau', type: 'checking', balanceCents: 1000, currency: 'BRL' },
      { id: 'a3', name: 'XP', type: 'brokerage', balanceCents: 5000, currency: 'BRL' },
    ]

    expect(semContasDeInvestimento(contas)).toEqual([
      { id: 'a1', name: 'Itau', type: 'checking', balanceCents: 1000, currency: 'BRL' },
    ])
  })
})
