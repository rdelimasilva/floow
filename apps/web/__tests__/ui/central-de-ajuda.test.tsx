import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { CentralDeAjuda } from '@/components/ajuda/central-de-ajuda'
import { LinkDeAjuda } from '@/components/ajuda/link-de-ajuda'
import { PERGUNTAS } from '@/lib/ajuda/conteudo'

/**
 * A Ajuda era uma lista fixa de 6 perguntas, sem busca, e nenhuma tela
 * apontava para ela. Open Finance, filas, ritmo de gastos e cartão nem
 * apareciam.
 */
afterEach(() => {
  window.location.hash = ''
})

describe('CentralDeAjuda', () => {
  it('busca sem acento em perguntas e respostas', () => {
    render(<CentralDeAjuda />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'fatura' } })

    expect(screen.getByText(/cartão de crédito/i)).toBeTruthy()
    expect(screen.queryByText('Como importar meu extrato bancário?')).toBeNull()
  })

  it('diz quando a busca não acha nada e oferece o contato', () => {
    render(<CentralDeAjuda />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'xyzxyz' } })

    expect(screen.getByText(/Nada encontrado/)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /escreva para nós/i }).length).toBeGreaterThan(0)
  })

  it('abre a pergunta indicada no endereço', () => {
    window.location.hash = '#open-finance'
    render(<CentralDeAjuda />)

    const item = document.getElementById('open-finance') as HTMLDetailsElement
    expect(item.open).toBe(true)
  })
})

describe('conteúdo', () => {
  it('cada pergunta tem âncora única', () => {
    const ids = PERGUNTAS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('LinkDeAjuda', () => {
  it('aponta para a pergunta do tópico', () => {
    render(<LinkDeAjuda topico="importar-extrato" />)
    expect(screen.getByRole('link', { name: /Como funciona/ }).getAttribute('href')).toBe('/help#importar-extrato')
  })
})
