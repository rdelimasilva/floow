import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

/**
 * Tela de Categorias: transferência aparece (a categoria está nos lançamentos
 * e precisa estar na lista), a lista tem busca e as mães recolhem as filhas.
 */
vi.mock('@/lib/finance/category-actions', () => ({ createCategory: vi.fn(), updateCategory: vi.fn() }))
vi.mock('@/components/finance/delete-category-dialog', () => ({ DeleteCategoryDialog: () => null }))

const { CategoryList } = await import('@/components/finance/category-list')
const { ToastProvider } = await import('@/components/ui/toast')

const base = { color: null, icon: null, isSystem: true, orgId: null }
const CATEGORIAS = [
  { ...base, id: 'alim', name: 'Alimentação', type: 'expense' as const, parentId: null },
  { ...base, id: 'super', name: 'Supermercado', type: 'expense' as const, parentId: 'alim' },
  { ...base, id: 'lazer', name: 'Lazer', type: 'expense' as const, parentId: null },
  { ...base, id: 'sal', name: 'Salário', type: 'income' as const, parentId: null },
  { ...base, id: 'tin', name: 'Transferências recebidas', type: 'transfer' as const, parentId: null },
  { ...base, id: 'resg', name: 'Resgate de investimentos e previdência', type: 'transfer' as const, parentId: 'tin' },
]

function abrir() {
  render(
    <ToastProvider>
      <CategoryList categories={CATEGORIAS} />
    </ToastProvider>,
  )
}

describe('CategoryList', () => {
  it('mostra as categorias de transferência num grupo próprio', () => {
    abrir()
    expect(screen.getByRole('heading', { name: 'Transferências' })).toBeTruthy()
    expect(screen.getByText('Transferências recebidas')).toBeTruthy()
  })

  it('começa com as filhas recolhidas e abre ao clicar na mãe', () => {
    abrir()
    expect(screen.queryByText('Supermercado')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Mostrar subcategorias de Alimentação/ }))
    expect(screen.getByText('Supermercado')).toBeTruthy()
  })

  it('busca sem acento e já mostra a filha encontrada com a mãe', () => {
    abrir()
    fireEvent.change(screen.getByPlaceholderText('Buscar categoria'), { target: { value: 'resgate' } })
    expect(screen.getByText('Resgate de investimentos e previdência')).toBeTruthy()
    expect(screen.getByText('Transferências recebidas')).toBeTruthy()
    expect(screen.queryByText('Lazer')).toBeNull()
    expect(screen.queryByText('Salário')).toBeNull()
  })
})
