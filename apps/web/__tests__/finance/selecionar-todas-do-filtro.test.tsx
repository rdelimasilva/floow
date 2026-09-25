import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('search=mercado') }))
const idsDoFiltro = vi.fn(async () => ({ ids: ['a', 'b', 'c'], total: 3 }))
vi.mock('@/lib/finance/ids-do-filtro', () => ({ idsDoFiltro: (...a: unknown[]) => idsDoFiltro(...(a as [])) }))

import { SelecionarTodasDoFiltro } from '@/components/finance/selecionar-todas-do-filtro'

/** A seleção parava na página: 312 lançamentos do filtro eram 7 páginas de "selecionar todos". */
describe('SelecionarTodasDoFiltro', () => {
  it('com a página toda marcada, oferece o filtro inteiro', async () => {
    const onSelecionar = vi.fn()
    render(<SelecionarTodasDoFiltro paginaToda naPagina={2} selecionadas={2} totalDoFiltro={3} onSelecionar={onSelecionar} />)

    fireEvent.click(screen.getByRole('button', { name: 'Selecionar todas as 3 do filtro' }))
    await waitFor(() => expect(onSelecionar).toHaveBeenCalledWith(['a', 'b', 'c']))
    expect(idsDoFiltro).toHaveBeenCalledWith('search=mercado')
  })

  it('não aparece se a página não está toda marcada', () => {
    render(<SelecionarTodasDoFiltro paginaToda={false} naPagina={2} selecionadas={1} totalDoFiltro={3} onSelecionar={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('com o filtro todo selecionado, diz isso', () => {
    render(<SelecionarTodasDoFiltro paginaToda naPagina={2} selecionadas={3} totalDoFiltro={3} onSelecionar={() => {}} />)
    expect(screen.getByText('Todas as 3 do filtro estão selecionadas.')).toBeTruthy()
  })
})
