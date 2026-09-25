import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }

const desfazerImportacao = vi.fn(async () => 12)
vi.mock('@/lib/finance/desfazer-importacao', () => ({
  desfazerImportacao: (...a: unknown[]) => desfazerImportacao(...(a as [])),
}))
const toast = vi.fn()
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

import { ImportacaoConcluida } from '@/components/finance/importacao-concluida'

const RESULTADO = { imported: 12, skipped: 3, lote: '2026-09-25T19:00:00.123Z' }

beforeEach(() => vi.clearAllMocks())

describe('ImportacaoConcluida', () => {
  it('mostra importadas e ignoradas', () => {
    render(<ImportacaoConcluida resultado={RESULTADO} accountId="c1" onNovaImportacao={() => {}} />)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('desfaz a importação depois de confirmar e volta ao início', async () => {
    const onNovaImportacao = vi.fn()
    render(<ImportacaoConcluida resultado={RESULTADO} accountId="c1" onNovaImportacao={onNovaImportacao} />)

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer importação' }))
    expect(desfazerImportacao).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Remover 12 lançamentos' }))
    await waitFor(() => expect(desfazerImportacao).toHaveBeenCalledWith('c1', RESULTADO.lote))
    expect(toast).toHaveBeenCalledWith('Importação desfeita: 12 lançamentos removidos')
    expect(onNovaImportacao).toHaveBeenCalled()
  })

  it('sem nada importado não oferece desfazer', () => {
    render(<ImportacaoConcluida resultado={{ imported: 0, skipped: 5 }} accountId="c1" onNovaImportacao={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Desfazer importação' })).toBeNull()
  })
})
