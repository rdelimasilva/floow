import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { NatureSuspectsBoundary } from '@/components/openfinance/nature-suspects-boundary'

/**
 * O detector de natureza é um aviso acessório, e por isso já saiu do
 * `Promise.all` da página de transações. O `<Suspense>` que sobrou cobre só a
 * latência: quando `getNatureSuspects` estourava — foi o que aconteceu com a
 * coluna `polp_type` antes da migration 00034 chegar ao banco —, o erro subia
 * até o `error.tsx` da rota e a LISTA DE TRANSAÇÕES INTEIRA virava uma tela de
 * erro. Extrato, saldo, filtros: tudo fora do ar por causa de um banner.
 *
 * Este teste tranca o isolamento: o que falha dentro do detector morre dentro
 * dele.
 */

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException }))

function Explode(): React.ReactElement {
  throw new Error('column transactions.polp_type does not exist')
}

afterEach(() => {
  captureException.mockClear()
})

describe('NatureSuspectsBoundary', () => {
  it('deixa passar o filho que renderiza sem erro', () => {
    render(
      <NatureSuspectsBoundary>
        <p>4 grupos suspeitos</p>
      </NatureSuspectsBoundary>,
    )
    expect(screen.getByText('4 grupos suspeitos')).toBeDefined()
  })

  it('engole a falha do detector e preserva o resto da página', () => {
    // React reporta todo erro capturado por boundary no console; sem o stub o
    // stack polui a saída da suíte inteira.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <NatureSuspectsBoundary>
          <Explode />
        </NatureSuspectsBoundary>
        <p>Lista de transações</p>
      </div>,
    )
    expect(screen.getByText('Lista de transações')).toBeDefined()
    spy.mockRestore()
  })

  it('não deixa mensagem de erro na tela: o banner é acessório', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <NatureSuspectsBoundary>
        <Explode />
      </NatureSuspectsBoundary>,
    )
    expect(container.textContent).toBe('')
    spy.mockRestore()
  })

  it('manda a falha para o Sentry: silêncio na tela não pode virar silêncio na observabilidade', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <NatureSuspectsBoundary>
        <Explode />
      </NatureSuspectsBoundary>,
    )
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException.mock.calls[0][0]).toBeInstanceOf(Error)
    expect((captureException.mock.calls[0][0] as Error).message).toContain('polp_type')
    spy.mockRestore()
  })
})
