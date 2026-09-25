import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

let resolver: (v: unknown) => void = () => {}
const syncBankConnection = vi.fn(() => new Promise((r) => { resolver = r }))
vi.mock('@/lib/openfinance/abrir-autorizacao', () => ({ abrirAutorizacao: vi.fn() }))
vi.mock('@/lib/openfinance/conexao-guiada-actions', () => ({ concluirConexaoGuiada: vi.fn() }))
vi.mock('@/lib/openfinance/connection-actions', () => ({
  recreateBankAuthorization: vi.fn(),
  revokeBankConnection: vi.fn(),
  syncBankConnection: (...a: unknown[]) => syncBankConnection(...(a as [])),
}))

const { ConnectionList } = await import('@/app/(app)/accounts/connect/connection-list')
const { ToastProvider } = await import('@/components/ui/toast')

/**
 * Importar do banco leva segundos e o botão só ficava cinza, sem dizer que
 * estava trabalhando. E a tela não dizia quando foi a última importação —
 * o dado existia (`lastSyncedAt`), só não aparecia.
 */
const CONEXAO = {
  id: 'c1', institutionId: 'itau', institutionName: 'Itaú', polpConsentId: 'consent-1', cpfMasked: '***', status: 'AUTHORISED',
  executionStatus: null, flags: [], products: ['ACCOUNT'], lastSyncedAt: new Date(Date.now() - 15 * 60_000), createdAt: new Date(),
  autoVinculoPendente: false, resources: [],
}

describe('sincronização visível', () => {
  it('mostra quando foi a última importação', () => {
    render(<ToastProvider><ConnectionList connections={[CONEXAO]} /></ToastProvider>)
    expect(screen.getByText('Última importação: há 15 minutos')).toBeTruthy()
  })

  it('sem importação ainda, diz isso', () => {
    render(<ToastProvider><ConnectionList connections={[{ ...CONEXAO, lastSyncedAt: null }]} /></ToastProvider>)
    expect(screen.getByText('Nenhuma importação ainda')).toBeTruthy()
  })

  it('o botão diz que está importando enquanto espera o banco', async () => {
    render(<ToastProvider><ConnectionList connections={[CONEXAO]} /></ToastProvider>)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Importar lançamentos' })) })
    expect(screen.getByRole('button', { name: 'Importando...' })).toBeTruthy()
    await act(async () => { resolver({ imported: 0, updated: 0, rejected: 0, skippedUnlinked: 0 }) })
  })
})
