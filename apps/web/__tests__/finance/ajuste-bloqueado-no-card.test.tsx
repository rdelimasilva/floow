import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { Account } from '@floow/db'

/**
 * Conta conectada ao banco: o card não oferece "Ajustar saldo" e diz por quê.
 * O servidor também recusa (`ajuste-bloqueado-em-conta-conectada.test.ts`).
 */

vi.mock('@/lib/finance/account-actions', () => ({
  updateAccount: vi.fn(), deleteAccount: vi.fn(), adjustAccountBalance: vi.fn(),
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { AccountCard } = await import('@/components/finance/account-card')

const conta = {
  id: 'conta-1', orgId: 'org-a', name: 'Itaú', type: 'checking',
  balanceCents: 9_861, currency: 'BRL', branch: null, accountNumber: null,
} as unknown as Account

function abrirEdicao() {
  fireEvent.click(screen.getAllByRole('button')[0])
}

describe('AccountCard: ajuste de saldo', () => {
  it('conta conectada ao banco não tem "Ajustar saldo"', () => {
    render(<AccountCard account={conta} conectadaAoBanco />)
    abrirEdicao()

    expect(screen.queryByRole('button', { name: 'Ajustar saldo' })).toBeNull()
    expect(screen.getByText(/conectada ao banco/i)).toBeDefined()
  })

  it('conta manual continua com "Ajustar saldo"', () => {
    render(<AccountCard account={conta} />)
    abrirEdicao()

    expect(screen.getByRole('button', { name: 'Ajustar saldo' })).toBeDefined()
  })
})
