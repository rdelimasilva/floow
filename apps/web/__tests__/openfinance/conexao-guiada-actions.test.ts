import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Orquestração da conexão guiada. As ações existentes (start, refresh, link,
 * sync) são mockadas: o que se testa aqui é a ordem, a validação do destino
 * antes de gastar consentimento, e que o vínculo automático roda uma vez só.
 */

const selectQueue: unknown[][] = []
const updateQueue: unknown[][] = []
const updates: { table: string; set: Record<string, unknown> }[] = []
let updateFalha = false

function chain(result: unknown[]): any {
  const c: any = {
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(ok, erro),
  }
  for (const m of ['from', 'where', 'limit', 'returning']) c[m] = () => chain(result)
  return c
}

const db = {
  select: () => chain(selectQueue.shift() ?? []),
  update: (t: { _table: string }) => ({
    set: (set: Record<string, unknown>) => {
      if (updateFalha) throw new Error('banco fora')
      updates.push({ table: t._table, set })
      return chain(updateQueue.shift() ?? [{ id: 'conn-1' }])
    },
  }),
}

vi.mock('@/lib/db/rls', () => ({ withUserDb: (fn: (d: unknown) => unknown) => fn(db) }))
vi.mock('@floow/db', () => ({
  accounts: { _table: 'accounts' },
  openfinanceConnections: { _table: 'openfinance_connections' },
  openfinanceResources: { _table: 'openfinance_resources' },
}))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1') }))

const startBankConnection = vi.fn()
const refreshBankConnection = vi.fn()
const syncBankConnection = vi.fn()
const linkResourceToAccount = vi.fn()
const getLastTransactionDateByAccount = vi.fn()
vi.mock('@/lib/openfinance/connection-actions', () => ({
  startBankConnection: (...a: unknown[]) => startBankConnection(...a),
  refreshBankConnection: (...a: unknown[]) => refreshBankConnection(...a),
  syncBankConnection: (...a: unknown[]) => syncBankConnection(...a),
}))
vi.mock('@/lib/openfinance/resource-actions', () => ({
  linkResourceToAccount: (...a: unknown[]) => linkResourceToAccount(...a),
}))
vi.mock('@/lib/openfinance/queries', () => ({
  getLastTransactionDateByAccount: (...a: unknown[]) => getLastTransactionDateByAccount(...a),
}))

const { iniciarConexaoGuiada, concluirConexaoGuiada } = await import(
  '@/lib/openfinance/conexao-guiada-actions'
)

const BASE = { institutionId: 'itau', institutionName: 'Itaú', cpf: '52998224725' }

beforeEach(() => {
  selectQueue.length = 0
  updateQueue.length = 0
  updates.length = 0
  updateFalha = false
  vi.clearAllMocks()
  startBankConnection.mockResolvedValue({ connectionId: 'conn-1', authUrl: 'https://banco', authUrlExpiresAt: null })
  syncBankConnection.mockResolvedValue({ imported: 7 })
  linkResourceToAccount.mockResolvedValue(undefined)
  getLastTransactionDateByAccount.mockResolvedValue({ 'acc-1': '2026-09-10' })
})

describe('iniciarConexaoGuiada', () => {
  it('guarda os destinos depois de criar a conexão, com nome padrão para a nova', async () => {
    selectQueue.push([{ id: 'acc-1', type: 'checking' }]) // conta escolhida
    selectQueue.push([]) // ninguém vinculado a ela

    const r = await iniciarConexaoGuiada({
      ...BASE,
      products: ['ACCOUNT', 'CREDIT_CARD_ACCOUNT'],
      destinos: { conta: { kind: 'existing', accountId: 'acc-1' }, cartao: { kind: 'new', name: '  ' } },
    })

    expect(r.connectionId).toBe('conn-1')
    expect(startBankConnection).toHaveBeenCalledWith({
      institutionId: 'itau',
      institutionName: 'Itaú',
      cpf: '52998224725',
      products: ['ACCOUNT', 'CREDIT_CARD_ACCOUNT'],
    })
    expect(updates).toEqual([
      {
        table: 'openfinance_connections',
        set: expect.objectContaining({
          targetAccountId: 'acc-1',
          targetCardAccountId: null,
          targetAccountNewName: null,
          targetCardNewName: 'Itaú · Cartão',
        }),
      },
    ])
  })

  it('recusa conta de outro tipo ANTES de criar o consentimento', async () => {
    selectQueue.push([{ id: 'cc-1', type: 'credit_card' }])
    await expect(
      iniciarConexaoGuiada({ ...BASE, products: ['ACCOUNT'], destinos: { conta: { kind: 'existing', accountId: 'cc-1' } } }),
    ).rejects.toThrow(/cartão/i)
    expect(startBankConnection).not.toHaveBeenCalled()
  })

  it('recusa conta que não é da org', async () => {
    selectQueue.push([])
    await expect(
      iniciarConexaoGuiada({ ...BASE, products: ['ACCOUNT'], destinos: { conta: { kind: 'existing', accountId: 'x' } } }),
    ).rejects.toThrow(/não encontrada/i)
    expect(startBankConnection).not.toHaveBeenCalled()
  })

  it('recusa conta que já espelha outra conta do banco', async () => {
    selectQueue.push([{ id: 'acc-1', type: 'checking' }])
    selectQueue.push([{ id: 'outro-recurso' }])
    await expect(
      iniciarConexaoGuiada({ ...BASE, products: ['ACCOUNT'], destinos: { conta: { kind: 'existing', accountId: 'acc-1' } } }),
    ).rejects.toThrow(/já está vinculada/i)
    expect(startBankConnection).not.toHaveBeenCalled()
  })

  it('ignora destino de produto não marcado', async () => {
    await iniciarConexaoGuiada({
      ...BASE,
      products: ['CREDIT_CARD_ACCOUNT'],
      destinos: { conta: { kind: 'new', name: 'X' }, cartao: { kind: 'new', name: 'Meu cartão' } },
    })
    expect(updates[0].set).toMatchObject({ targetAccountNewName: null, targetCardNewName: 'Meu cartão' })
  })

  it('sem destino nenhum (só investimentos): não grava nada', async () => {
    await iniciarConexaoGuiada({ ...BASE, products: ['INVESTMENTS'], destinos: {} })
    expect(updates).toEqual([])
  })

  it('falha ao gravar o destino não derruba a conexão já criada', async () => {
    updateFalha = true
    const r = await iniciarConexaoGuiada({ ...BASE, products: ['ACCOUNT'], destinos: { conta: { kind: 'new', name: '' } } })
    expect(r.authUrl).toBe('https://banco')
  })
})

const DESTINOS = {
  targetAccountId: 'acc-1',
  targetCardAccountId: null,
  targetAccountNewName: null,
  targetCardNewName: 'Itaú · Cartão',
  autoLinkDoneAt: null,
  products: ['ACCOUNT', 'CREDIT_CARD_ACCOUNT'],
}

function autorizada(resources: unknown[], pendingResourceCount = 0) {
  return { status: 'AUTHORISED', executionStatus: null, flags: [], resources, pendingResourceCount, conflictingResourceCount: 0 }
}

describe('concluirConexaoGuiada', () => {
  it('ainda não autorizada: só espera', async () => {
    refreshBankConnection.mockResolvedValue({ ...autorizada([]), status: 'AWAITING_AUTHORIZATION' })
    const r = await concluirConexaoGuiada('conn-1')
    expect(r.etapa).toBe('aguardando-autorizacao')
    expect(linkResourceToAccount).not.toHaveBeenCalled()
  })

  it('conexão antiga (sem destino): comportamento de hoje, nada automático', async () => {
    refreshBankConnection.mockResolvedValue(autorizada([{ id: 'r1', resourceType: 'ACCOUNT', accountId: null }]))
    selectQueue.push([{ targetAccountId: null, targetCardAccountId: null, targetAccountNewName: null, targetCardNewName: null, autoLinkDoneAt: null, products: ['ACCOUNT'] }])
    const r = await concluirConexaoGuiada('conn-1')
    expect(r.etapa).toBe('legado')
    expect(linkResourceToAccount).not.toHaveBeenCalled()
    expect(syncBankConnection).not.toHaveBeenCalled()
  })

  it('já rodou antes: não vincula de novo', async () => {
    refreshBankConnection.mockResolvedValue(autorizada([{ id: 'r1', resourceType: 'ACCOUNT', accountId: null }]))
    selectQueue.push([{ ...DESTINOS, autoLinkDoneAt: new Date() }])
    const r = await concluirConexaoGuiada('conn-1')
    expect(r.etapa).toBe('ja-concluida')
    expect(linkResourceToAccount).not.toHaveBeenCalled()
  })

  it('autorizada sem contas ainda: espera, sem marcar como feito', async () => {
    refreshBankConnection.mockResolvedValue(autorizada([]))
    selectQueue.push([DESTINOS])
    const r = await concluirConexaoGuiada('conn-1')
    expect(r.etapa).toBe('aguardando-contas')
    expect(updates).toEqual([])
  })

  it('parte das contas ainda sendo preparada: espera', async () => {
    refreshBankConnection.mockResolvedValue(autorizada([{ id: 'r1', resourceType: 'ACCOUNT', accountId: null }], 1))
    selectQueue.push([DESTINOS])
    expect((await concluirConexaoGuiada('conn-1')).etapa).toBe('aguardando-contas')
    expect(linkResourceToAccount).not.toHaveBeenCalled()
  })

  it('vincula cada recurso ao destino, importa uma vez e marca como feito', async () => {
    refreshBankConnection.mockResolvedValue(
      autorizada([
        { id: 'r1', resourceType: 'ACCOUNT', accountId: null },
        { id: 'r2', resourceType: 'CREDIT_CARD_ACCOUNT', accountId: null },
      ]),
    )
    selectQueue.push([DESTINOS])

    const r = await concluirConexaoGuiada('conn-1')

    expect(updates).toHaveLength(1)
    expect(updates[0].set.autoLinkDoneAt).toBeInstanceOf(Date)
    expect(linkResourceToAccount).toHaveBeenCalledWith('r1', { kind: 'existing', accountId: 'acc-1' }, { syncFromDate: '2026-09-11' })
    expect(linkResourceToAccount).toHaveBeenCalledWith('r2', { kind: 'new', name: 'Itaú · Cartão' }, { syncFromDate: null })
    expect(syncBankConnection).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ etapa: 'concluida', vinculados: 2, importadas: 7, ambiguos: [], faltando: [], erro: null })
  })

  it('outra chamada já tomou a vez (corrida de foco): não vincula', async () => {
    refreshBankConnection.mockResolvedValue(autorizada([{ id: 'r1', resourceType: 'ACCOUNT', accountId: null }]))
    selectQueue.push([DESTINOS])
    updateQueue.push([]) // o UPDATE ... WHERE auto_link_done_at IS NULL não pegou linha
    const r = await concluirConexaoGuiada('conn-1')
    expect(r.etapa).toBe('ja-concluida')
    expect(linkResourceToAccount).not.toHaveBeenCalled()
    expect(syncBankConnection).not.toHaveBeenCalled()
  })

  it('duas contas: deixa para a tela e ainda importa o que foi vinculado', async () => {
    refreshBankConnection.mockResolvedValue(
      autorizada([
        { id: 'r1', resourceType: 'ACCOUNT', accountId: null },
        { id: 'r3', resourceType: 'ACCOUNT', accountId: null },
        { id: 'r2', resourceType: 'CREDIT_CARD_ACCOUNT', accountId: null },
      ]),
    )
    selectQueue.push([DESTINOS])
    const r = await concluirConexaoGuiada('conn-1')
    expect(r.ambiguos).toEqual(['ACCOUNT'])
    expect(linkResourceToAccount).toHaveBeenCalledTimes(1)
    expect(syncBankConnection).toHaveBeenCalledTimes(1)
  })

  it('falha num vínculo: vai para a tela manual, o resto segue', async () => {
    refreshBankConnection.mockResolvedValue(
      autorizada([
        { id: 'r1', resourceType: 'ACCOUNT', accountId: null },
        { id: 'r2', resourceType: 'CREDIT_CARD_ACCOUNT', accountId: null },
      ]),
    )
    selectQueue.push([DESTINOS])
    linkResourceToAccount.mockRejectedValueOnce(new Error('Esta conta do floow já está vinculada a outra conta do banco.'))
    const r = await concluirConexaoGuiada('conn-1')
    expect(r.vinculados).toBe(1)
    expect(r.faltando).toEqual(['ACCOUNT'])
    expect(r.erro).toMatch(/já está vinculada/)
    expect(syncBankConnection).toHaveBeenCalledTimes(1)
  })

  it('falha na importação: vínculo fica, erro é informado', async () => {
    refreshBankConnection.mockResolvedValue(autorizada([{ id: 'r1', resourceType: 'ACCOUNT', accountId: null }]))
    selectQueue.push([DESTINOS])
    syncBankConnection.mockRejectedValueOnce(new Error('Polp fora do ar'))
    const r = await concluirConexaoGuiada('conn-1')
    expect(r).toMatchObject({ etapa: 'concluida', vinculados: 1, importadas: null, erro: 'Polp fora do ar' })
  })

  it('só investimentos: importa uma vez ao autorizar, mesmo sem conta nem cartão', async () => {
    refreshBankConnection.mockResolvedValue(autorizada([]))
    selectQueue.push([{ ...DESTINOS, targetAccountId: null, targetCardNewName: null, products: ['INVESTMENTS'] }])
    const r = await concluirConexaoGuiada('conn-1')
    expect(r).toMatchObject({ etapa: 'concluida', vinculados: 0, importadas: 7 })
    expect(updates[0].set.autoLinkDoneAt).toBeInstanceOf(Date)
    expect(linkResourceToAccount).not.toHaveBeenCalled()
    expect(syncBankConnection).toHaveBeenCalledTimes(1)
  })

  it('só investimentos, já importado: não roda de novo', async () => {
    refreshBankConnection.mockResolvedValue(autorizada([]))
    selectQueue.push([{ ...DESTINOS, targetAccountId: null, targetCardNewName: null, products: ['INVESTMENTS'], autoLinkDoneAt: new Date() }])
    expect((await concluirConexaoGuiada('conn-1')).etapa).toBe('ja-concluida')
    expect(syncBankConnection).not.toHaveBeenCalled()
  })
})
