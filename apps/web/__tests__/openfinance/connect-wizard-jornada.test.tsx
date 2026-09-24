import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/openfinance/conexao-guiada-actions', () => ({
  iniciarConexaoGuiada: vi.fn(),
  concluirConexaoGuiada: vi.fn(),
}))

const { ConnectWizard } = await import('@/app/(app)/accounts/connect/connect-wizard')
const { ToastProvider } = await import('@/components/ui/toast')

const CONTAS = [
  { id: 'cc', name: 'Corrente Itaú', type: 'checking' },
  { id: 'br', name: 'Corretora', type: 'brokerage' },
]

function montar() {
  render(
    <ToastProvider>
      <ConnectWizard institutions={[{ id: 'itau', name: 'Itaú', logoUrl: null, type: 'PERSONAL' }]} loadError={null} contas={CONTAS} />
    </ToastProvider>,
  )
}

describe('wizard da conexão guiada', () => {
  it('passo 1: oferece só contas compatíveis e não avança sem destino', () => {
    montar()
    const conta = screen.getByLabelText('Os lançamentos vão para') as HTMLSelectElement
    const opcoes = Array.from(conta.options).map((o) => o.textContent)
    expect(opcoes).toEqual(['Selecione...', 'Corrente Itaú', '+ Criar conta nova'])
    // Sem cartão no floow: começa em "criar novo".
    expect((screen.getByLabelText('As faturas vão para') as HTMLSelectElement).value).toBe('__new__')
    // Investimentos é opt-in.
    expect((screen.getByLabelText(/Investimentos/) as HTMLInputElement).checked).toBe(false)

    fireEvent.click(screen.getByText('Continuar'))
    expect(screen.getByText('Escolha para onde vai a conta corrente.')).toBeDefined()
    expect(screen.queryByText('Banco', { selector: 'label' })).toBeNull()
  })

  it('escolhido o destino, passa para banco e CPF e depois para ativar com o resumo', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Os lançamentos vão para'), { target: { value: 'cc' } })
    fireEvent.click(screen.getByText('Continuar'))
    expect(screen.getByLabelText('CPF do titular')).toBeDefined()

    fireEvent.click(screen.getByLabelText('Itaú'))
    fireEvent.change(screen.getByLabelText('CPF do titular'), { target: { value: '529.982.247-25' } })
    fireEvent.click(screen.getByText('Continuar'))

    expect(screen.getByText('Conta corrente → Corrente Itaú')).toBeDefined()
    expect(screen.getByText('Cartão → conta nova "Itaú · Cartão"')).toBeDefined()
    expect(screen.getByText('Autorizar no banco')).toBeDefined()
  })
})
