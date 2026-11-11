import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ListaComCaixas } from '@/components/finance/filtros/lista-com-caixas'

const OPCOES = [
  { valor: 'a', rotulo: 'Itaú' },
  { valor: 'b', rotulo: 'Nubank' },
  { valor: 'c', rotulo: 'Carteira' },
]

function montar(marcados: string[], aoMudar = vi.fn()) {
  render(
    <div>
      <span data-testid="fora">fora</span>
      <ListaComCaixas rotulo="Conta" rotuloTodos="Todas as contas" opcoes={OPCOES} marcados={marcados} aoMudar={aoMudar} />
    </div>,
  )
  return aoMudar
}

describe('ListaComCaixas', () => {
  it('Esc fecha o painel e devolve o foco ao botão', () => {
    montar([])
    const botao = screen.getByRole('button', { name: /todas as contas/i })
    fireEvent.click(botao)
    expect(botao.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(botao)
  })

  it('clicar fora fecha o painel', () => {
    montar([])
    const botao = screen.getByRole('button', { name: /todas as contas/i })
    fireEvent.click(botao)
    fireEvent.mouseDown(screen.getByTestId('fora'))
    expect(botao.getAttribute('aria-expanded')).toBe('false')
  })

  it('"Todas as contas" esvazia os marcados', () => {
    const aoMudar = montar(['a'])
    fireEvent.click(screen.getByRole('button', { name: /itaú/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Todas as contas' }))
    expect(aoMudar).toHaveBeenCalledWith([])
  })

  it('com 2 marcados o resumo padrão é "2 selecionados"', () => {
    montar(['a', 'b'])
    expect(screen.getByRole('button', { name: /2 selecionados/ })).toBeDefined()
  })

  it('marcar uma caixa soma o valor', () => {
    const aoMudar = montar(['a'])
    fireEvent.click(screen.getByRole('button', { name: /itaú/i }))
    fireEvent.click(screen.getByLabelText('Nubank'))
    expect(aoMudar).toHaveBeenCalledWith(['a', 'b'])
  })
})
