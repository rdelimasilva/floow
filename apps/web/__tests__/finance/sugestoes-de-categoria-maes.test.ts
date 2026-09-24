import { describe, it, expect } from 'vitest'
import { opcoesDeCategoriaMae } from '@/lib/finance/category-suggestions/parent-options'

describe('opcoesDeCategoriaMae', () => {
  it('só oferece categorias raiz de despesa (subcategoria criaria neta invisível)', () => {
    const r = opcoesDeCategoriaMae([
      { id: 'alim', name: 'Alimentação', type: 'expense', parentId: null },
      { id: 'mercado', name: 'Mercado', type: 'expense', parentId: 'alim' },
      { id: 'sal', name: 'Salário', type: 'income', parentId: null },
      { id: 'casa', name: 'Casa', type: 'expense' },
    ])
    expect(r).toEqual([
      { id: 'alim', name: 'Alimentação' },
      { id: 'casa', name: 'Casa' },
    ])
  })
})
