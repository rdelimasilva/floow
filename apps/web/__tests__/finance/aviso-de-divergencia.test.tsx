import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { BankDivergenceAlert } from '@/components/finance/bank-divergence-alert'

/**
 * O aviso que teria poupado tres dias.
 *
 * O saldo derivado e o saldo do banco discordaram em R$ 23.665,59 e nada na
 * tela dizia isso — o usuario descobriu abrindo o extrato. Aqui o app fala
 * primeiro.
 *
 * O aviso nomeia a conta e mostra os dois numeros porque "algo esta errado"
 * sem o par nao ajuda ninguem a achar o que e.
 */
describe('BankDivergenceAlert', () => {
  it('mostra a conta, os dois saldos e a diferença quando divergem', () => {
    render(
      <BankDivergenceAlert
        divergencias={[
          { accountId: 'a1', nome: 'Itaú', saldoLocalCents: -1751441, saldoBancoCents: 615118, apuradoEm: null },
        ]}
      />,
    )

    expect(screen.getByText(/Itaú/)).toBeDefined()
    expect(screen.getByText(/17\.514,41/)).toBeDefined()
    expect(screen.getByText(/6\.151,18/)).toBeDefined()
    expect(screen.getByText(/23\.665,59/)).toBeDefined()
  })

  it('não renderiza nada quando os saldos batem', () => {
    // Conferencia silenciosa e o caso normal: alarme que toca sempre vira
    // ruido e deixa de ser lido.
    const { container } = render(
      <BankDivergenceAlert
        divergencias={[
          { accountId: 'a1', nome: 'Itaú', saldoLocalCents: 615118, saldoBancoCents: 615118, apuradoEm: null },
        ]}
      />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('não renderiza nada sem contas conferidas', () => {
    const { container } = render(<BankDivergenceAlert divergencias={[]} />)

    expect(container.innerHTML).toBe('')
  })

  it('lista só as contas que divergem, não todas as conferidas', () => {
    render(
      <BankDivergenceAlert
        divergencias={[
          { accountId: 'a1', nome: 'Itaú', saldoLocalCents: 615118, saldoBancoCents: 615118, apuradoEm: null },
          { accountId: 'a2', nome: 'NU', saldoLocalCents: 14080100, saldoBancoCents: 14000000, apuradoEm: null },
        ]}
      />,
    )

    expect(screen.queryByText(/Itaú/)).toBeNull()
    expect(screen.getByText(/NU/)).toBeDefined()
  })
})
