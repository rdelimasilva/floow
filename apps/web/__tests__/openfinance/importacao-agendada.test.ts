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
const revalidarMock = vi.fn()
const snapshotMock = vi.fn()

vi.mock('@floow/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => conexoesMock() }) }),
  }),
  openfinanceConnections: { id: 'id', orgId: 'org_id', status: 'status' },
}))
vi.mock('@/lib/openfinance/sync', () => ({ syncConnectionTransactions: syncMock }))
vi.mock('@/lib/openfinance/sincronizar-conexao', () => ({ sincronizarInvestimentosDaConexao: investimentosMock }))
vi.mock('@/lib/openfinance/config', () => ({ getPolpClient: () => ({}) }))
vi.mock('@/lib/finance/revalidate', () => ({ revalidateSincronizacao: revalidarMock }))
vi.mock('@/lib/finance/snapshot-patrimonio', () => ({ gravarSnapshotDoServico: snapshotMock }))

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
  revalidarMock.mockReset()
  snapshotMock.mockReset()
  snapshotMock.mockResolvedValue({ id: 'snap' })
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

  it('invalida o cache de cada org sincronizada, uma vez por org', async () => {
    // Sem isso, Dashboard, Fluxo de Caixa e Ritmo de Gastos leem cada um a sua
    // cópia em cache e só se atualizam quando ela expira — na revisão de
    // 18/10/2026 o Dashboard mostrava R$ 18.558 de despesas no mês e as outras
    // duas telas R$ 21.332, todas lendo os mesmos lançamentos.
    conexoesMock.mockResolvedValue([
      { id: 'c1', orgId: 'org-1' },
      { id: 'c2', orgId: 'org-1' },
      { id: 'c3', orgId: 'org-2' },
    ])
    syncMock.mockResolvedValue(RESUMO_VAZIO)

    await importarLancamentosDeTodasAsConexoes()

    expect(revalidarMock.mock.calls.map((c) => c[0]).sort()).toEqual(['org-1', 'org-2'])
  })

  it('grava o snapshot de patrimônio de cada org, uma vez, depois de invalidar o cache', async () => {
    // O histórico só nascia no clique de "Atualizar valores": o último da org
    // e37a3049 em 18/10/2026 era de 06/10, e o Consultor lia esse número.
    conexoesMock.mockResolvedValue([
      { id: 'c1', orgId: 'org-1' },
      { id: 'c2', orgId: 'org-1' },
      { id: 'c3', orgId: 'org-2' },
    ])
    syncMock.mockResolvedValue(RESUMO_VAZIO)
    const ordem: string[] = []
    revalidarMock.mockImplementation((orgId: string) => ordem.push(`revalida:${orgId}`))
    snapshotMock.mockImplementation(async (orgId: string) => ordem.push(`snapshot:${orgId}`))

    const r = await importarLancamentosDeTodasAsConexoes()

    expect(snapshotMock.mock.calls.map((c) => c[0]).sort()).toEqual(['org-1', 'org-2'])
    // Saldos e posições recém-sincronizados, não o cache de antes do sync.
    expect(ordem.indexOf('snapshot:org-1')).toBeGreaterThan(ordem.indexOf('revalida:org-1'))
    expect(r.snapshots).toBe(2)
  })

  it('falha no snapshot de uma org não derruba a importação nem as outras', async () => {
    conexoesMock.mockResolvedValue([
      { id: 'c1', orgId: 'org-1' },
      { id: 'c2', orgId: 'org-2' },
    ])
    syncMock.mockResolvedValue({ ...RESUMO_VAZIO, imported: 1 })
    snapshotMock.mockRejectedValueOnce(new Error('banco caiu')).mockResolvedValueOnce({ id: 'snap' })

    const r = await importarLancamentosDeTodasAsConexoes()

    expect(snapshotMock).toHaveBeenCalledTimes(2)
    expect(r.snapshots).toBe(1)
    expect(r.importadas).toBe(2)
    expect(r.falhas).toBe(0)
  })
})
