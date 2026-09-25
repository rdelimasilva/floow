import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('search=x') }))
const toast = vi.fn()
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

import { ExportCsvButton } from '@/components/finance/export-csv-button'

/** A exportação engolia o erro: o usuário clicava em "CSV" e nada acontecia. */
beforeEach(() => vi.clearAllMocks())

describe('ExportCsvButton', () => {
  it('diz o que o botão faz', () => {
    render(<ExportCsvButton />)
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeTruthy()
  })

  it('avisa quando a exportação falha', async () => {
    global.fetch = vi.fn(async () => new Response('erro', { status: 500 })) as never
    render(<ExportCsvButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Não foi possível exportar as transações. Tente de novo.', 'error'),
    )
  })
})
