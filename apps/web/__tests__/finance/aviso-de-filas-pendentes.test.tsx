import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PendingQueuesNotice } from '@/components/finance/pending-queues-notice'

/**
 * As tres filas moram DENTRO de Transacoes, nao no menu lateral.
 *
 * Item de menu fixo ocupa lugar permanente para uma decisao que existe poucas
 * vezes por mes, e some do campo de visao justamente de quem esta olhando os
 * lancamentos — que e onde o assunto aparece. Fila vazia nao ocupa espaco.
 *
 * Os nomes dizem a acao, nao o jargao: "contraparte" e vocabulario de Open
 * Finance e nao significa nada para quem usa o app.
 *
 * A ORDEM na tela e a ordem correta de decidir: repetido primeiro (nao adianta
 * classificar o que vai sair), classificar depois (define o que o lancamento
 * e), confirmar previsao por ultimo (so faz sentido contra um lancamento real
 * e ja classificado).
 */
describe('PendingQueuesNotice', () => {
  it('não renderiza nada com as três filas vazias', () => {
    const { container } = render(
      <PendingQueuesNotice repetidos={0} classificar={0} previsoes={0} />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('anuncia repetidos com link para a fila', () => {
    render(<PendingQueuesNotice repetidos={2} classificar={0} previsoes={0} />)

    const link = screen.getByRole('link', { name: /repetidos/i })
    expect(link.getAttribute('href')).toBe('/transactions/duplicates')
    expect(screen.getByText(/2 lançamentos repetidos/i)).toBeDefined()
  })

  it('anuncia lançamentos a classificar com link para a fila', () => {
    render(<PendingQueuesNotice repetidos={0} classificar={5} previsoes={0} />)

    // Pelo nome acessivel do link, e nao por `getByText`: o texto e quebrado
    // entre <strong> e o resto, e o que importa e a frase que o usuario le.
    const link = screen.getByRole('link', { name: /5 lançamentos para classificar/i })
    expect(link.getAttribute('href')).toBe('/transactions/review')
  })

  it('anuncia previsões a confirmar com link para a fila', () => {
    render(<PendingQueuesNotice repetidos={0} classificar={0} previsoes={3} />)

    const link = screen.getByRole('link', { name: /previs/i })
    expect(link.getAttribute('href')).toBe('/transactions/matches')
    expect(screen.getByText(/3 previsões/i)).toBeDefined()
  })

  it('mostra as três quando as três têm fila', () => {
    render(<PendingQueuesNotice repetidos={1} classificar={1} previsoes={1} />)

    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('põe os repetidos na frente, que é a ordem de decidir', () => {
    // Classificar ou confirmar um lancamento que vai ser descartado como
    // repetido e trabalho jogado fora.
    render(<PendingQueuesNotice repetidos={1} classificar={1} previsoes={1} />)

    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      '/transactions/duplicates',
      '/transactions/review',
      '/transactions/matches',
    ])
  })

  it('fala no singular quando é um só', () => {
    render(<PendingQueuesNotice repetidos={1} classificar={1} previsoes={1} />)

    expect(screen.getByRole('link', { name: /1 lançamento repetido para revisar/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /1 lançamento para classificar/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /1 previsão esperando confirmação/i })).toBeDefined()
  })
})
