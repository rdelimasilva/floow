import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/consultor/memorias-actions', () => ({ apagarMemoriaAction: vi.fn(async () => {}) }))

import { apagarMemoriaAction } from '@/lib/consultor/memorias-actions'
import { MemoriasDoConsultor } from '@/components/cfo/memorias-do-consultor'

const memorias = [
  { id: 'm1', conteudo: 'quer quitar o cartão até dezembro', createdAt: '2026-09-20T12:00:00.000Z' },
  { id: 'm2', conteudo: 'prefere respostas curtas', createdAt: '2026-09-21T12:00:00.000Z' },
]

describe('MemoriasDoConsultor', () => {
  it('fechada mostra só o título com a contagem', () => {
    render(<MemoriasDoConsultor memorias={memorias} />)
    expect(screen.getByRole('button', { name: /O que o consultor sabe sobre você \(2\)/ })).toBeTruthy()
    expect(screen.queryByText('prefere respostas curtas')).toBeNull()
  })

  it('aberta lista e apaga pela action, tirando da tela', async () => {
    render(<MemoriasDoConsultor memorias={memorias} />)
    fireEvent.click(screen.getByRole('button', { name: /O que o consultor sabe sobre você/ }))
    expect(screen.getByText('quer quitar o cartão até dezembro')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Apagar' })[1])
    await waitFor(() => expect(apagarMemoriaAction).toHaveBeenCalledWith('m2'))
    await waitFor(() => expect(screen.queryByText('prefere respostas curtas')).toBeNull())
  })

  it('sem memórias explica o que é', () => {
    render(<MemoriasDoConsultor memorias={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /O que o consultor sabe sobre você/ }))
    expect(screen.getByText(/Conforme você conversa/)).toBeTruthy()
  })
})
