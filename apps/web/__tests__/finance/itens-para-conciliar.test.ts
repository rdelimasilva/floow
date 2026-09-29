import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A faixa, o botão de Transações e o assistente de conexão leem o mesmo total.
 * Contagem que falha vale 0: um aviso não pode custar a tela que ele existe
 * para melhorar.
 */

const contarDuplicatasPendentes = vi.fn(async (_orgId: string, _userId: string) => 2)
const contarLancamentosAClassificar = vi.fn(async (_orgId: string) => 5)
const contarPropostasPendentes = vi.fn(async (_orgId: string, _userId: string) => 1)
const getOrgId = vi.fn(async () => 'org-1')
const getVerifiedIdentity = vi.fn(async () => ({ userId: 'user-1' }) as { userId: string } | null)

vi.mock('@/lib/finance/duplicata-queries', () => ({ contarDuplicatasPendentes }))
vi.mock('@/lib/openfinance/counterparty-queries', () => ({ contarLancamentosAClassificar }))
vi.mock('@/lib/finance/forecast-match-queries', () => ({ contarPropostasPendentes }))
vi.mock('@/lib/finance/queries', () => ({ getOrgId }))
vi.mock('@/lib/auth/session', () => ({ getVerifiedIdentity }))

const { contarItensParaConciliar } = await import('@/lib/finance/itens-para-conciliar')
const { totalParaConciliar } = await import('@/lib/finance/itens-para-conciliar-actions')

beforeEach(() => {
  contarDuplicatasPendentes.mockReset().mockResolvedValue(2)
  contarLancamentosAClassificar.mockReset().mockResolvedValue(5)
  contarPropostasPendentes.mockReset().mockResolvedValue(1)
  getOrgId.mockReset().mockResolvedValue('org-1')
  getVerifiedIdentity.mockReset().mockResolvedValue({ userId: 'user-1' })
})

describe('contarItensParaConciliar', () => {
  it('devolve cada fila e a soma das três', async () => {
    expect(await contarItensParaConciliar('org-1', 'user-1')).toEqual({
      repetidos: 2, classificar: 5, confirmar: 1, total: 8,
    })
    expect(contarDuplicatasPendentes).toHaveBeenCalledWith('org-1', 'user-1')
    expect(contarPropostasPendentes).toHaveBeenCalledWith('org-1', 'user-1')
    expect(contarLancamentosAClassificar).toHaveBeenCalledWith('org-1')
  })

  it('contagem que falha vale 0 e não derruba as outras', async () => {
    contarLancamentosAClassificar.mockRejectedValue(new Error('db indisponível'))

    expect(await contarItensParaConciliar('org-1', 'user-1')).toEqual({
      repetidos: 2, classificar: 0, confirmar: 1, total: 3,
    })
  })

  it('sem usuário resolvido, repetidos e previsões contam 0 sem consultar', async () => {
    expect(await contarItensParaConciliar('org-1', null)).toEqual({
      repetidos: 0, classificar: 5, confirmar: 0, total: 5,
    })
    expect(contarDuplicatasPendentes).not.toHaveBeenCalled()
    expect(contarPropostasPendentes).not.toHaveBeenCalled()
  })
})

describe('totalParaConciliar', () => {
  it('devolve o total da org de quem chama', async () => {
    expect(await totalParaConciliar()).toBe(8)
  })

  it('falha em resolver a org vira 0, não erro na tela do assistente', async () => {
    getOrgId.mockRejectedValue(new Error('No organization found for user'))

    expect(await totalParaConciliar()).toBe(0)
  })
})
