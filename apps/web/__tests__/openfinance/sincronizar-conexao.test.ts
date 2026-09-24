import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `sincronizarConexao` junta extrato e investimento num só ponto de entrada
 * para o cron e o botão. O extrato já ter entrado não pode ser desfeito por
 * uma falha do lado de investimento — nem a leitura da conexão (produtos),
 * nem a própria sincronização.
 */

const syncMock = vi.fn()
const sincronizarInvestimentosMock = vi.fn()

vi.mock('@/lib/openfinance/sync', () => ({ syncConnectionTransactions: syncMock }))
vi.mock('@/lib/openfinance/investimentos/sincronizar', () => ({
  sincronizarInvestimentos: sincronizarInvestimentosMock,
}))
vi.mock('@/lib/openfinance/investimentos/repositorio', () => ({ criarRepositorio: () => ({}) }))
vi.mock('@floow/db', () => ({
  openfinanceConnections: { id: 'id', polpConsentId: 'polp_consent_id', institutionName: 'institution_name', products: 'products' },
}))

const { sincronizarConexao } = await import('@/lib/openfinance/sincronizar-conexao')

const LANCAMENTOS = {
  imported: 3, updated: 1, skippedUnlinked: 0, rejected: 0,
  propostasDeConciliacao: 0, propostasDeDuplicata: 0,
}

const CONEXAO = { id: 'c1', orgId: 'org-1' }

/** `db.select().from().where().limit()` — resolve com uma linha, ou rejeita. */
function fakeDbSelect(outcome: { resolve: unknown[] } | { reject: unknown }) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () =>
      'reject' in outcome ? Promise.reject(outcome.reject) : Promise.resolve(outcome.resolve),
  }
  return { select: () => chain }
}

beforeEach(() => {
  syncMock.mockReset()
  sincronizarInvestimentosMock.mockReset()
  syncMock.mockResolvedValue(LANCAMENTOS)
})

describe('sincronizarConexao', () => {
  it('investimento falhando não derruba o que já entrou no extrato', async () => {
    const db = fakeDbSelect({
      resolve: [{ polpConsentId: 'pc1', institutionName: 'Banco X', products: ['ACCOUNT', 'INVESTMENTS'] }],
    })
    sincronizarInvestimentosMock.mockRejectedValue(new Error('polp fora do ar'))

    const r = await sincronizarConexao(db as any, {} as any, CONEXAO)

    expect(r).toEqual({ ...LANCAMENTOS, investimentos: null })
  })

  it('leitura da conexão falhando também não derruba o extrato', async () => {
    const db = fakeDbSelect({ reject: new Error('conexão com o banco caiu') })

    const r = await sincronizarConexao(db as any, {} as any, CONEXAO)

    expect(r).toEqual({ ...LANCAMENTOS, investimentos: null })
    expect(sincronizarInvestimentosMock).not.toHaveBeenCalled()
  })

  it('extrato falhando propaga — não é isolado', async () => {
    syncMock.mockRejectedValue(new Error('polp fora do ar'))
    const db = fakeDbSelect({ resolve: [{ polpConsentId: 'pc1', institutionName: null, products: ['ACCOUNT'] }] })

    await expect(sincronizarConexao(db as any, {} as any, CONEXAO)).rejects.toThrow('polp fora do ar')
  })
})
