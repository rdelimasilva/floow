import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PendingQueuesNotice } from '@/components/finance/pending-queues-notice'
import { BotaoConciliar } from '@/components/finance/botao-conciliar'

/**
 * Sem o portão, nada obriga o usuário a conciliar: o caminho tem de estar
 * onde o assunto aparece, no topo da lista de lançamentos.
 *
 * Uma linha só, com o total das três filas, levando à tela Conciliar. O
 * âmbar fica só quando há repetido, porque é o repetido que distorce o saldo;
 * classificar só rotula.
 */
describe('faixa de itens para conciliar', () => {
  it('não renderiza nada sem item para conciliar', () => {
    const { container } = render(<PendingQueuesNotice total={0} repetidos={0} />)

    expect(container.innerHTML).toBe('')
  })

  it('uma linha só, com o total e link para Conciliar', () => {
    render(<PendingQueuesNotice total={8} repetidos={0} />)

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('/transactions/conciliar')
    screen.getByRole('link', { name: /8 itens para conciliar/i })
  })

  it('fala no singular quando é um só', () => {
    render(<PendingQueuesNotice total={1} repetidos={0} />)

    screen.getByRole('link', { name: /1 item para conciliar/i })
  })

  it('âmbar só com repetido', () => {
    const { rerender } = render(<PendingQueuesNotice total={3} repetidos={1} />)
    expect(screen.getByRole('link').className).toContain('amber')

    rerender(<PendingQueuesNotice total={3} repetidos={0} />)
    expect(screen.getByRole('link').className).not.toContain('amber')
  })
})

describe('botão Conciliar do cabeçalho', () => {
  it('mostra o total entre parênteses quando há o que conciliar', () => {
    render(<BotaoConciliar total={4} />)

    const link = screen.getByRole('link', { name: 'Conciliar (4)' })
    expect(link.getAttribute('href')).toBe('/transactions/conciliar')
  })

  it('sem nada, só "Conciliar"', () => {
    render(<BotaoConciliar total={0} />)

    screen.getByRole('link', { name: 'Conciliar' })
  })
})
