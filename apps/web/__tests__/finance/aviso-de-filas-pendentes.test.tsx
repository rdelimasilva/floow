import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PendingQueuesNotice } from '@/components/finance/pending-queues-notice'

/**
 * As filas moram DENTRO de Transacoes, nao no menu lateral.
 *
 * Item de menu fixo ocupa lugar permanente para uma decisao que existe poucas
 * vezes por mes, e some do campo de visao justamente de quem esta olhando os
 * lancamentos — que e onde o assunto aparece. O aviso vai no topo da lista e
 * so quando ha o que decidir: fila vazia nao ocupa espaco nenhum.
 */
describe('PendingQueuesNotice', () => {
  it('não renderiza nada com as duas filas vazias', () => {
    const { container } = render(<PendingQueuesNotice duplicatas={0} conciliacoes={0} />)

    expect(container.innerHTML).toBe('')
  })

  it('anuncia duplicatas com link para a fila', () => {
    render(<PendingQueuesNotice duplicatas={2} conciliacoes={0} />)

    const link = screen.getByRole('link', { name: /duplicatas/i })
    expect(link.getAttribute('href')).toBe('/transactions/duplicates')
    expect(screen.getByText(/2 possíveis duplicatas/i)).toBeDefined()
  })

  it('anuncia conciliações com link para a fila', () => {
    render(<PendingQueuesNotice duplicatas={0} conciliacoes={3} />)

    const link = screen.getByRole('link', { name: /conciliaç/i })
    expect(link.getAttribute('href')).toBe('/transactions/matches')
    expect(screen.getByText(/3 conciliações/i)).toBeDefined()
  })

  it('mostra as duas quando as duas têm fila', () => {
    render(<PendingQueuesNotice duplicatas={1} conciliacoes={1} />)

    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('fala no singular quando é uma só', () => {
    // "1 possiveis duplicatas" e o tipo de descuido que faz a tela parecer
    // gerada por maquina.
    render(<PendingQueuesNotice duplicatas={1} conciliacoes={0} />)

    expect(screen.getByText(/1 possível duplicata/i)).toBeDefined()
  })
})
