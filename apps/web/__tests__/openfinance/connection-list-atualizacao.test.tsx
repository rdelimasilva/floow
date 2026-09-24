import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

const abrirAutorizacao = vi.fn()
const concluirConexaoGuiada = vi.fn()
vi.mock('@/lib/openfinance/abrir-autorizacao', () => ({ abrirAutorizacao: (...a: unknown[]) => abrirAutorizacao(...a) }))
vi.mock('@/lib/openfinance/conexao-guiada-actions', () => ({
  concluirConexaoGuiada: (...a: unknown[]) => concluirConexaoGuiada(...a),
}))
vi.mock('@/lib/openfinance/connection-actions', () => ({
  recreateBankAuthorization: vi.fn(),
  revokeBankConnection: vi.fn(),
  syncBankConnection: vi.fn(),
}))

const { avisoDaAtualizacao } = await import('@/app/(app)/accounts/connect/lista-conexoes')
const { ConnectionList } = await import('@/app/(app)/accounts/connect/connection-list')
const { ToastProvider } = await import('@/components/ui/toast')

const depois = (status: string, recursos: number, pendentes = 0) => ({
  status,
  resources: Array.from({ length: recursos }, (_, i) => ({ id: `r${i}` })),
  pendingResourceCount: pendentes,
})

describe('avisoDaAtualizacao', () => {
  it('botão (manual): sempre diz que atualizou', () => {
    expect(avisoDaAtualizacao({ status: 'AUTHORISED', recursos: 1 }, depois('AUTHORISED', 1), false)).toBe('Contas atualizadas.')
    expect(avisoDaAtualizacao({ status: 'AUTHORISED', recursos: 1 }, depois('AUTHORISED', 1, 2), false)).toMatch(/preparando/)
  })
  it('volta automática sem mudança: silêncio', () => {
    expect(avisoDaAtualizacao({ status: 'AWAITING_AUTHORIZATION', recursos: 0 }, depois('AWAITING_AUTHORIZATION', 0), true)).toBeNull()
  })
  it('volta automática com status novo ou conta nova: avisa', () => {
    expect(avisoDaAtualizacao({ status: 'AWAITING_AUTHORIZATION', recursos: 0 }, depois('AUTHORISED', 0), true)).toBe('Contas atualizadas.')
    expect(avisoDaAtualizacao({ status: 'AUTHORISED', recursos: 0 }, depois('AUTHORISED', 2), true)).toBe('Contas atualizadas.')
  })
})

const CONEXAO = {
  id: 'c1', institutionId: 'itau', institutionName: 'Itaú', cpfMasked: '***', status: 'EXPIRED',
  executionStatus: null, flags: [], products: ['ACCOUNT'], lastSyncedAt: null, createdAt: new Date(),
  autoVinculoPendente: false, resources: [],
}

beforeEach(() => vi.clearAllMocks())

describe('ConnectionList — reabrir autorização sem link', () => {
  it("'sem-url' libera o botão e mostra o erro", async () => {
    abrirAutorizacao.mockResolvedValue('sem-url')
    render(<ToastProvider><ConnectionList connections={[CONEXAO]} /></ToastProvider>)
    const botao = screen.getByText('Reabrir autorização')
    await act(async () => {
      fireEvent.click(botao)
    })
    expect(screen.getByText('Não foi possível reabrir a autorização')).toBeDefined()
    expect((screen.getByText('Reabrir autorização') as HTMLButtonElement).disabled).toBe(false)
  })
})
