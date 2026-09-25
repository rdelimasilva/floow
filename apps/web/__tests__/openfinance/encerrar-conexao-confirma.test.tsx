import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }

const revokeBankConnection = vi.fn(async () => undefined)
vi.mock('@/lib/openfinance/abrir-autorizacao', () => ({ abrirAutorizacao: vi.fn() }))
vi.mock('@/lib/openfinance/conexao-guiada-actions', () => ({ concluirConexaoGuiada: vi.fn() }))
vi.mock('@/lib/openfinance/connection-actions', () => ({
  recreateBankAuthorization: vi.fn(),
  revokeBankConnection: (...a: unknown[]) => revokeBankConnection(...(a as [])),
  syncBankConnection: vi.fn(),
}))

const { ConnectionList } = await import('@/app/(app)/accounts/connect/connection-list')
const { ToastProvider } = await import('@/components/ui/toast')

/**
 * "Encerrar" revoga o consentimento no banco — para voltar, o usuário refaz a
 * autorização inteira no app do banco. Disparava num clique, sem confirmação.
 */
const CONEXAO = {
  id: 'c1', institutionId: 'itau', institutionName: 'Itaú', polpConsentId: 'consent-1', cpfMasked: '***', status: 'AUTHORISED',
  executionStatus: null, flags: [], products: ['ACCOUNT'], lastSyncedAt: null, createdAt: new Date(),
  autoVinculoPendente: false, resources: [],
}

beforeEach(() => vi.clearAllMocks())

describe('ConnectionList — encerrar', () => {
  it('pede confirmação antes de revogar o consentimento', async () => {
    render(<ToastProvider><ConnectionList connections={[CONEXAO]} /></ToastProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }))
    expect(revokeBankConnection).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Encerrar conexão' }))
    })
    expect(revokeBankConnection).toHaveBeenCalledWith('c1')
  })
})
