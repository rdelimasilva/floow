import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

/**
 * Sem o portão, o primeiro import precisa de destino explícito: o portão é
 * que levava o usuário à fila. Concluída a conexão com algo para conciliar,
 * o assistente vai para Conciliar; com zero, fica e só atualiza.
 */

const push = vi.fn()
const refresh = vi.fn()
const concluirConexaoGuiada = vi.fn()
const totalParaConciliar = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('@/lib/openfinance/conexao-guiada-actions', () => ({
  iniciarConexaoGuiada: vi.fn(async () => ({ connectionId: 'con-1', authUrl: 'https://banco' })),
  concluirConexaoGuiada,
}))
vi.mock('@/lib/openfinance/abrir-autorizacao', () => ({
  abrirAutorizacao: async (obterUrl: () => Promise<string>) => {
    await obterUrl()
    return 'nova-aba'
  },
}))
vi.mock('@/lib/finance/itens-para-conciliar-actions', () => ({ totalParaConciliar }))

const { ConnectWizard } = await import('@/app/(app)/accounts/connect/connect-wizard')
const { ToastProvider } = await import('@/components/ui/toast')

const CONCLUIDA = {
  etapa: 'concluida', atualizacao: { status: 'AUTHORISED' }, vinculados: 1,
  ambiguos: [], faltando: [], importadas: 12, erro: null,
}

async function ateVerificar() {
  render(
    <ToastProvider>
      <ConnectWizard
        institutions={[{ id: 'itau', name: 'Itaú', logoUrl: null, type: 'PERSONAL' }]}
        loadError={null}
        contas={[{ id: 'cc', name: 'Corrente Itaú', type: 'checking' }]}
      />
    </ToastProvider>,
  )
  fireEvent.change(screen.getByLabelText('Os lançamentos vão para'), { target: { value: 'cc' } })
  fireEvent.click(screen.getByText('Continuar'))
  fireEvent.click(screen.getByLabelText('Itaú'))
  fireEvent.change(screen.getByLabelText('CPF do titular'), { target: { value: '529.982.247-25' } })
  fireEvent.click(screen.getByText('Continuar'))
  fireEvent.click(screen.getByText('Autorizar no banco'))
  const verificar = await screen.findByText('Verificar de novo')
  // "Autorizar no banco" já chama router.refresh; zera para que só o refresh
  // de depois do import conte nas asserções.
  refresh.mockClear()
  await act(async () => {
    fireEvent.click(verificar)
  })
  return verificar
}

beforeEach(() => {
  push.mockClear()
  refresh.mockClear()
  concluirConexaoGuiada.mockReset().mockResolvedValue(CONCLUIDA)
  totalParaConciliar.mockReset()
})

describe('assistente depois do primeiro import', () => {
  it('com itens para conciliar, vai para Conciliar', async () => {
    totalParaConciliar.mockResolvedValue(7)

    await ateVerificar()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/transactions/conciliar'))
  })

  it('com zero, fica na tela e só atualiza', async () => {
    totalParaConciliar.mockResolvedValue(0)

    await ateVerificar()

    // O refresh de depois do import prova que a cadeia inteira (incluindo o
    // .then que decidiria o push) já rodou.
    await waitFor(() => expect(totalParaConciliar).toHaveBeenCalled())
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(push).not.toHaveBeenCalled()
  })

  it('se a consulta do total falha, não navega e mostra o resultado da conexão', async () => {
    totalParaConciliar.mockRejectedValue(new Error('falhou'))

    await ateVerificar()

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(push).not.toHaveBeenCalled()
    expect(await screen.findByText(/Pronto: 1 conta vinculada/)).toBeTruthy()
  })

  it('se concluirConexaoGuiada falha, não navega, atualiza e libera nova verificação', async () => {
    concluirConexaoGuiada.mockRejectedValue(new Error('falhou'))

    const verificar = await ateVerificar()

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(push).not.toHaveBeenCalled()
    expect(totalParaConciliar).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(verificar)
    })
    await waitFor(() => expect(concluirConexaoGuiada).toHaveBeenCalledTimes(2))
  })
})
