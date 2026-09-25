import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { HelpTooltip } from '@/components/ui/help-tooltip'

/** A dica só abria com mouse ou clique; pelo teclado não aparecia, e Esc não fechava. */
describe('HelpTooltip', () => {
  it('abre ao receber foco e liga o texto ao botão', () => {
    render(<HelpTooltip text="IPCA médio" />)
    const botao = screen.getByRole('button', { name: 'Ajuda' })
    fireEvent.focus(botao)

    const dica = screen.getByRole('tooltip')
    expect(dica.textContent).toContain('IPCA médio')
    expect(botao.getAttribute('aria-describedby')).toBe(dica.id)
  })

  it('Esc fecha', () => {
    render(<HelpTooltip text="IPCA médio" />)
    const botao = screen.getByRole('button', { name: 'Ajuda' })
    fireEvent.focus(botao)
    fireEvent.keyDown(botao, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
