import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { BotaoDeBusca } from '@/components/layout/botao-de-busca'
import { EVENTO_ABRIR_PALETA } from '@/lib/paleta'

/** A paleta existia, mas nada na tela a mostrava — e no celular não abria. */
describe('BotaoDeBusca', () => {
  it('abre a paleta e mostra o atalho', () => {
    const ouvinte = vi.fn()
    window.addEventListener(EVENTO_ABRIR_PALETA, ouvinte)

    render(<BotaoDeBusca />)
    const botao = screen.getByRole('button', { name: /Buscar/ })
    expect(botao.textContent).toContain('Ctrl K')

    fireEvent.click(botao)
    expect(ouvinte).toHaveBeenCalled()
    window.removeEventListener(EVENTO_ABRIR_PALETA, ouvinte)
  })
})
