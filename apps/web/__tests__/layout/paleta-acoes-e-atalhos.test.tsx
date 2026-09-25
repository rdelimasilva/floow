import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import { CommandPalette, filtrarComandos } from '@/components/layout/command-palette'
import { abrirPaleta } from '@/lib/paleta'

/**
 * A paleta só abria por Ctrl+K — sem nada na tela que dissesse isso, e sem
 * teclado físico no celular — e só navegava. Agora um botão no topo a abre,
 * ela executa "Nova transação", e N abre o formulário de qualquer tela.
 */
beforeEach(() => push.mockClear())

describe('paleta — ações e atalhos', () => {
  it('abre por evento, para o botão de busca do topo', () => {
    render(<CommandPalette />)
    act(() => abrirPaleta())
    expect(screen.getByRole('dialog', { name: 'Buscar página ou ação' })).toBeTruthy()
  })

  it('"Nova transação" abre o formulário na lista', () => {
    const [acao] = filtrarComandos('nova transacao')
    expect(acao.href).toBe('/transactions?nova=1')
  })

  it('N abre uma nova transação de qualquer tela', () => {
    render(<CommandPalette />)
    fireEvent.keyDown(document.body, { key: 'n' })
    expect(push).toHaveBeenCalledWith('/transactions?nova=1')
  })

  it('N digitado num campo de texto é só uma letra', () => {
    render(
      <>
        <input aria-label="busca" />
        <CommandPalette />
      </>,
    )
    fireEvent.keyDown(screen.getByLabelText('busca'), { key: 'n' })
    expect(push).not.toHaveBeenCalled()
  })
})
