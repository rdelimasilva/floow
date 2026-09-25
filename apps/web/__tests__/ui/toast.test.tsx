import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { ToastProvider, useToast } from '@/components/ui/toast'

/**
 * Todo aviso sumia em 4 s — inclusive os de erro, que às vezes têm duas
 * frases (Open Finance) e somem antes de serem lidos. E nada era anunciado ao
 * leitor de tela.
 */
function Disparar({ mensagem, tipo, acao }: { mensagem: string; tipo?: 'success' | 'error'; acao?: () => void }) {
  const { toast } = useToast()
  return (
    <button
      onClick={() => toast(mensagem, tipo, acao ? { acao: { rotulo: 'Desfazer', onClick: acao } } : undefined)}
    >
      disparar
    </button>
  )
}

function montar(props: React.ComponentProps<typeof Disparar>) {
  render(
    <ToastProvider>
      <Disparar {...props} />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByText('disparar'))
}

afterEach(() => vi.useRealTimers())

describe('toast', () => {
  it('aviso de sucesso some sozinho', () => {
    vi.useFakeTimers()
    montar({ mensagem: 'Salvo' })
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByText('Salvo')).toBeNull()
  })

  it('aviso de erro fica até o usuário fechar', () => {
    vi.useFakeTimers()
    montar({ mensagem: 'Falhou', tipo: 'error' })
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByText('Falhou')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    expect(screen.queryByText('Falhou')).toBeNull()
  })

  it('erro é anunciado como alerta ao leitor de tela', () => {
    montar({ mensagem: 'Falhou', tipo: 'error' })
    expect(screen.getByRole('alert').textContent).toContain('Falhou')
  })

  it('ação do aviso roda e fecha o aviso', () => {
    const desfazer = vi.fn()
    montar({ mensagem: 'Transação removida', acao: desfazer })

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(desfazer).toHaveBeenCalled()
    expect(screen.queryByText('Transação removida')).toBeNull()
  })
})
