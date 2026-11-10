import { describe, it, expect } from 'vitest'
import { problemaComAMae } from '@/lib/finance/category-parent'

const raiz = { id: 'alimentacao', type: 'expense', parentId: null }

describe('problemaComAMae', () => {
  it('aceita raiz do mesmo tipo para categoria sem filhas', () => {
    expect(problemaComAMae({ categoriaId: 'mercado', tipo: 'expense', mae: raiz, temFilhas: false })).toBeNull()
  })

  it('recusa mãe inexistente, ela mesma, filha, outro tipo e categoria com filhas', () => {
    expect(problemaComAMae({ tipo: 'expense', mae: null, temFilhas: false })).toMatch(/não encontrada/)
    expect(problemaComAMae({ categoriaId: 'alimentacao', tipo: 'expense', mae: raiz, temFilhas: false })).toMatch(/dela mesma/)
    expect(problemaComAMae({ tipo: 'expense', mae: { ...raiz, parentId: 'x' }, temFilhas: false })).toMatch(/principal/)
    expect(problemaComAMae({ tipo: 'income', mae: raiz, temFilhas: false })).toMatch(/mesmo tipo/)
    expect(problemaComAMae({ categoriaId: 'lazer', tipo: 'expense', mae: raiz, temFilhas: true })).toMatch(/subcategorias/)
  })
})
