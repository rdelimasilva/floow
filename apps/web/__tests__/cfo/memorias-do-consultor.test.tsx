import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/consultor/memorias-actions', () => ({ apagarMemoriaAction: vi.fn(async () => ({})) }))

import { apagarMemoriaAction } from '@/lib/consultor/memorias-actions'
import { MemoriasDoConsultor } from '@/components/cfo/memorias-do-consultor'

const memorias = [
  { id: 'm1', conteudo: 'quer quitar o cartão até dezembro', createdAt: '2026-09-20T12:00:00.000Z' },
  { id: 'm2', conteudo: 'prefere respostas curtas', createdAt: '2026-09-21T12:00:00.000Z' },
  { id: 'm3', conteudo: 'mora em São Paulo', createdAt: '2026-09-22T12:00:00.000Z' },
]

describe('MemoriasDoConsultor', () => {
  it('fechada mostra só o título com a contagem', () => {
    render(<MemoriasDoConsultor memorias={memorias} />)
    expect(screen.getByRole('button', { name: /O que o consultor sabe sobre você \(3\)/ })).toBeTruthy()
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

  it('action devolve erro: item volta na posição original e mostra alerta', async () => {
    vi.mocked(apagarMemoriaAction).mockResolvedValueOnce({ error: 'Não foi possível apagar agora. Tente de novo.' })
    render(<MemoriasDoConsultor memorias={memorias} />)
    fireEvent.click(screen.getByRole('button', { name: /O que o consultor sabe sobre você/ }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Apagar' })[1])
    expect(screen.queryByText('prefere respostas curtas')).toBeNull()
    await waitFor(() => expect(screen.getByText('prefere respostas curtas')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível apagar agora. Tente de novo.')
    const nomes = screen.getAllByText(/quer quitar|prefere respostas|mora em/).map((el) => el.textContent)
    expect(nomes).toEqual(['quer quitar o cartão até dezembro', 'prefere respostas curtas', 'mora em São Paulo'])
  })

  it('action rejeita: item volta, mostra alerta e não sobe erro não tratado', async () => {
    vi.mocked(apagarMemoriaAction).mockRejectedValueOnce(new Error('falhou'))
    render(<MemoriasDoConsultor memorias={memorias} />)
    fireEvent.click(screen.getByRole('button', { name: /O que o consultor sabe sobre você/ }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Apagar' })[1])
    await waitFor(() => expect(screen.getByText('prefere respostas curtas')).toBeTruthy())
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
