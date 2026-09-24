import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import React from 'react'

const concluirConexaoGuiada = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/lib/openfinance/conexao-guiada-actions', () => ({
  concluirConexaoGuiada: (...a: unknown[]) => concluirConexaoGuiada(...a),
}))
vi.mock('@/lib/openfinance/connection-actions', () => ({ recreateBankAuthorization: vi.fn(), refreshBankConnection: vi.fn() }))
vi.mock('@/lib/openfinance/resource-actions', () => ({ linkResourceToAccount: vi.fn() }))

const { LinkResources } = await import('@/app/(app)/accounts/connect/[connectionId]/link-resources')

beforeEach(() => {
  vi.clearAllMocks()
  concluirConexaoGuiada.mockResolvedValue({ etapa: 'concluida' })
})

describe('tela da conexão ao abrir', () => {
  it('conexão guiada pendente: conclui sozinha e recarrega', async () => {
    await act(async () => {
      render(<LinkResources connectionId="c1" status="AUTHORISED" resources={[]} accounts={[]} autoVinculoPendente />)
    })
    expect(concluirConexaoGuiada).toHaveBeenCalledWith('c1')
    expect(concluirConexaoGuiada).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalled()
  })

  it('sem pendência: não chama nada', async () => {
    await act(async () => {
      render(<LinkResources connectionId="c1" status="AUTHORISED" resources={[]} accounts={[]} autoVinculoPendente={false} />)
    })
    expect(concluirConexaoGuiada).not.toHaveBeenCalled()
  })
})
