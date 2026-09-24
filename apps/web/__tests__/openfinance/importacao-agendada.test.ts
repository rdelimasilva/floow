import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A importacao agendada roda sem ninguem olhando, e isso muda as regras.
 *
 * Ate aqui o sync so acontecia quando o usuario clicava. Quem nunca abria a
 * tela ficava com extrato velho — e, desde que a conferencia de saldo existe,
 * tambem sem o aviso de divergencia, que so vale com dado fresco.
 *
 * Duas exigencias vem de rodar sozinho:
 *  - uma conexao quebrada nao pode derrubar as outras. Sao varias orgs no
 *    mesmo disparo, e um banco fora do ar e rotina, nao excecao.
 *  - so conexao AUTORIZADA entra. Consentimento expirado responde erro na
 *    Polp, e tentar de novo a cada 6h so gera ruido no log.
 */

const conexoesMock = vi.fn()
const syncMock = vi.fn()
const investimentosMock = vi.fn()

vi.mock('@floow/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => conexoesMock() }) }),
  }),
  openfinanceConnections: { id: 'id', orgId: 'org_id', status: 'status' },
}))
vi.mock('@/lib/openfinance/sync', () => ({ syncConnectionTransactions: syncMock }))
vi.mock('@/lib/openfinance/sincronizar-conexao', () => ({ sincronizarInvestimentosDaConexao: investimentosMock }))
vi.mock('@/lib/openfinance/config', () => ({ getPolpClient: () => ({}) }))

const { importarLancamentosDeTodasAsConexoes } = await import('@/lib/openfinance/importacao-agendada')

const RESUMO_VAZIO = {
  imported: 0, updated: 0, skippedUnlinked: 0, rejected: 0,
  propostasDeConciliacao: 0, propostasDeDuplicata: 0,
}

beforeEach(() => {
  conexoesMock.mockReset()
  syncMock.mockReset()
  investimentosMock.mockReset()
  investimentosMock.mockResolvedValue(null)
})

describe('importarLancamentosDeTodasAsConexoes', () => {
  it('importa cada conexão e soma o que entrou', async () => {
    conexoesMock.mockResolvedValue([
      { id: 'c1', orgId: 'org-1' },
      { id: 'c2', orgId: 'org-2' },
    ])
    syncMock
      .mockResolvedValueOnce({ ...RESUMO_VAZIO, imported: 3 })
      .mockResolvedValueOnce({ ...RESUMO_VAZIO, imported: 5 })

    const r = await importarLancamentosDeTodasAsConexoes()

    expect(syncMock).toHaveBeenCalledTimes(2)
    expect(r.conexoes).toBe(2)
    expect(r.importadas).toBe(8)
    expect(r.falhas).toBe(0)
  })

  it('uma conexão quebrada não impede as outras', async () => {
    // Banco fora do ar e rotina. Sem isso, a primeira falha deixaria todas as
    // orgs seguintes sem importacao ate o proximo disparo.
    conexoesMock.mockResolvedValue([
      { id: 'c1', orgId: 'org-1' },
      { id: 'c2', orgId: 'org-2' },
      { id: 'c3', orgId: 'org-3' },
    ])
    syncMock
      .mockRejectedValueOnce(new Error('Polp respondeu 503'))
      .mockResolvedValueOnce({ ...RESUMO_VAZIO, imported: 2 })
      .mockResolvedValueOnce({ ...RESUMO_VAZIO, imported: 1 })

    const r = await importarLancamentosDeTodasAsConexoes()

    expect(syncMock).toHaveBeenCalledTimes(3)
    expect(r.importadas).toBe(3)
    expect(r.falhas).toBe(1)
  })

  it('conta as propostas que nasceram na passada', async () => {
    // O numero vai para o log: e como se descobre que a fila encheu sem
    // ninguem ter aberto a tela.
    conexoesMock.mockResolvedValue([{ id: 'c1', orgId: 'org-1' }])
    syncMock.mockResolvedValue({ ...RESUMO_VAZIO, imported: 1, propostasDeDuplicata: 2, propostasDeConciliacao: 1 })

    const r = await importarLancamentosDeTodasAsConexoes()

    expect(r.propostasDeDuplicata).toBe(2)
    expect(r.propostasDeConciliacao).toBe(1)
  })

  it('sem conexão autorizada, não chama o sync', async () => {
    conexoesMock.mockResolvedValue([])

    const r = await importarLancamentosDeTodasAsConexoes()

    expect(syncMock).not.toHaveBeenCalled()
    expect(r.conexoes).toBe(0)
  })

  it('todos os extratos entram antes de qualquer investimento', async () => {
    // Investimento é lento (várias chamadas por ativo). Se rodasse entre uma
    // conexão e outra, um timeout no meio deixaria extratos sem importar.
    conexoesMock.mockResolvedValue([
      { id: 'c1', orgId: 'org-1' },
      { id: 'c2', orgId: 'org-2' },
    ])
    const ordem: string[] = []
    syncMock.mockImplementation(async (_db: unknown, _c: unknown, cx: { id: string }) => {
      ordem.push(`extrato:${cx.id}`)
      return RESUMO_VAZIO
    })
    investimentosMock.mockImplementation(async (_db: unknown, _c: unknown, cx: { id: string }) => {
      ordem.push(`investimentos:${cx.id}`)
      return null
    })

    await importarLancamentosDeTodasAsConexoes()

    expect(ordem).toEqual(['extrato:c1', 'extrato:c2', 'investimentos:c1', 'investimentos:c2'])
  })

  it('falha de investimento não conta como falha de extrato', async () => {
    conexoesMock.mockResolvedValue([{ id: 'c1', orgId: 'org-1' }])
    syncMock.mockResolvedValue({ ...RESUMO_VAZIO, imported: 1 })
    investimentosMock.mockRejectedValue(new Error('inesperado'))

    const r = await importarLancamentosDeTodasAsConexoes()

    expect(r.falhas).toBe(0)
    expect(r.importadas).toBe(1)
  })
})
