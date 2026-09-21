import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import React from 'react'

/**
 * `efetivada: false` / `recusada: false` tem mais de um motivo: dois cliques,
 * duas abas, ou uma ponta do par que ficou inelegível na janela entre propor e
 * aprovar (realizado ignorado, previsão que ganhou vínculo). A mensagem é
 * genérica de propósito — ela cobre os dois sem afirmar qual foi, e afirmar
 * "decidida em outra aba" seria mentira no caso da ponta inelegível.
 *
 * A fila mostra os dois lados e o PORQUÊ do par — dias de diferença e
 * diferença de valor. Sem isso, "é o mesmo?" é uma pergunta sem informação:
 * `matchForecast` aceita até 7 dias de janela e 8% de diferença com palavra em
 * comum, então o par plausível e o par errado chegam parecidos na tela.
 */

const aprovarProposta = vi.fn(async (_id: string) => ({ efetivada: true }))
const recusarProposta = vi.fn(async (_id: string) => ({ recusada: true }))

vi.mock('@/lib/finance/forecast-match-actions', () => ({ aprovarProposta, recusarProposta }))

const { MatchProposalQueue } = await import('@/components/finance/match-proposal-queue')
const { ToastProvider } = await import('@/components/ui/toast')

const PROPOSTA = {
  id: 'prop-1',
  previsao: { id: 'prev-1', date: '2026-09-01', description: 'Aluguel', amountCents: -120000 },
  realizado: { id: 'real-1', date: '2026-09-03', description: 'Pagamento de boleto HANNI DAVID', amountCents: -120000 },
  contaNome: 'Itaú',
  diasDeDiferenca: 2,
  diferencaCents: 0,
}

function renderFila(propostas = [PROPOSTA]) {
  render(
    React.createElement(ToastProvider, null,
      React.createElement(MatchProposalQueue, { propostas })),
  )
}

beforeEach(() => {
  aprovarProposta.mockClear()
  recusarProposta.mockClear()
})

describe('fila de conciliação', () => {
  it('mostra os dois lados do par', () => {
    renderFila()

    const cartao = screen.getByTestId('proposta-prop-1')
    within(cartao).getByText('Aluguel')
    within(cartao).getByText('Pagamento de boleto HANNI DAVID')
    within(cartao).getByText('Itaú')
  })

  it('mostra o porque do par', () => {
    renderFila()

    screen.getByText(/2 dias de diferença/)
    screen.getByText(/mesmo valor/)
  })

  it('valor diferente aparece com a diferença', () => {
    renderFila([{ ...PROPOSTA, diferencaCents: 13885 }])

    screen.getByText(/R\$ 138,85 de diferença/)
  })

  it('"É o mesmo" aprova', async () => {
    renderFila()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'É o mesmo' }))
    })

    expect(aprovarProposta).toHaveBeenCalledWith('prop-1')
  })

  it('"São diferentes" recusa', async () => {
    renderFila()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'São diferentes' }))
    })

    expect(recusarProposta).toHaveBeenCalledWith('prop-1')
  })

  it('decidida, a proposta sai da tela', async () => {
    renderFila()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'É o mesmo' }))
    })

    expect(screen.queryByTestId('proposta-prop-1')).toBeNull()
  })

  it('fila vazia diz que não há nada', () => {
    renderFila([])

    screen.getByText('Nenhuma conciliação esperando.')
  })

  it('não oferece aprovar todas — a decisão é par por par', () => {
    renderFila()

    expect(screen.queryByRole('button', { name: /todas/i })).toBeNull()
  })

  it('aprovar proposta que não vale mais sai da tela sem mentir no toast', async () => {
    aprovarProposta.mockResolvedValueOnce({ efetivada: false })
    renderFila()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'É o mesmo' }))
    })

    expect(screen.queryByTestId('proposta-prop-1')).toBeNull()
    expect(screen.queryByText('Conciliado')).toBeNull()
    screen.getByText(/não está mais válida/)
  })

  it('recusar proposta que não vale mais sai da tela sem mentir no toast', async () => {
    recusarProposta.mockResolvedValueOnce({ recusada: false })
    renderFila()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'São diferentes' }))
    })

    expect(screen.queryByTestId('proposta-prop-1')).toBeNull()
    expect(screen.queryByText('Marcados como lançamentos diferentes')).toBeNull()
    screen.getByText(/não está mais válida/)
  })
})
