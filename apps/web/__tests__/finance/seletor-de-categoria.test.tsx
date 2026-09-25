import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { SeletorDeCategoria } from '@/components/finance/seletor-de-categoria'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false) as never
  Element.prototype.releasePointerCapture = vi.fn()
})

/**
 * Categorias são dezenas, em árvore. O <select> nativo obrigava a rolar a lista
 * inteira; o seletor do sistema tem busca que ignora acento.
 */
const OPCOES = [
  { id: 'c1', label: 'Alimentação' },
  { id: 'c2', label: '— Mercado' },
  { id: 'c3', label: 'Transporte' },
]

describe('SeletorDeCategoria', () => {
  it('mostra o texto de vazio quando não há categoria', () => {
    render(<SeletorDeCategoria opcoes={OPCOES} value="" onChange={() => {}} vazio="Sem categoria" />)
    expect(screen.getByRole('combobox').textContent).toContain('Sem categoria')
  })

  it('busca e escolhe a categoria', () => {
    const onChange = vi.fn()
    render(<SeletorDeCategoria opcoes={OPCOES} value="" onChange={onChange} vazio="Sem categoria" />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: 'mercado' } })
    expect(screen.queryByRole('option', { name: 'Transporte' })).toBeNull()
    fireEvent.click(screen.getByRole('option', { name: '— Mercado' }))
    expect(onChange).toHaveBeenCalledWith('c2')
  })

  it('escolher o vazio devolve string vazia', () => {
    const onChange = vi.fn()
    render(<SeletorDeCategoria opcoes={OPCOES} value="c1" onChange={onChange} vazio="Sem categoria" />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    fireEvent.click(screen.getByRole('option', { name: 'Sem categoria' }))
    expect(onChange).toHaveBeenCalledWith('')
  })
})
