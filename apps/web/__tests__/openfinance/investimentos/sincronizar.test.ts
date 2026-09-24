import { describe, it, expect } from 'vitest'
import type { PolpInvestmentKind } from '@floow/core-finance'
import type { RepositorioDeInvestimentos, ProblemaDeIngestao } from '@/lib/openfinance/investimentos/repositorio'
import { sincronizarInvestimentos } from '@/lib/openfinance/investimentos/sincronizar'

function repoEmMemoria(donoDe: Record<string, string> = {}, orfasIniciais: Record<string, string | null> = {}) {
  const ativos = new Map<string, string>()          // polpId -> assetId
  const tipoDe = new Map<string, PolpInvestmentKind>() // polpId -> tipo
  const zerados: Array<{ kind: PolpInvestmentKind; assetId: string; hoje: string }> = []
  const posicoes = new Map<string, unknown>()       // assetId|data
  const eventos = new Map<string, { assetId: string; eventDate: string }>() // polpTxId
  const problemas: ProblemaDeIngestao[] = []
  let recalculos = 0
  // Aplicações/resgates órfãos do extrato: id -> conta de destino (null = órfã).
  const orfas = new Map<string, string | null>(Object.entries(orfasIniciais))
  const vinculos: Array<{ connectionId: string; accountId: string }> = []
  const repo: RepositorioDeInvestimentos = {
    garantirConta: async () => 'conta-inv',
    salvarInvestimento: async (ctx, inv) => {
      if (donoDe[inv.polpId] && donoDe[inv.polpId] !== ctx.orgId) return { tipo: 'conflito' }
      const assetId = ativos.get(inv.polpId) ?? `asset-${inv.polpId}`
      ativos.set(inv.polpId, assetId)
      tipoDe.set(inv.polpId, inv.kind)
      if (inv.position) posicoes.set(`${assetId}|${inv.position.referenceDate}`, inv.position)
      return { tipo: 'salvo', assetId, resourceId: `res-${inv.polpId}` }
    },
    ultimaDataDeMovimentacao: async (assetId) => {
      const datas = [...eventos.values()].filter((e) => e.assetId === assetId).map((e) => e.eventDate).sort()
      return datas.at(-1) ?? null
    },
    salvarMovimentacoes: async (ctx, evs) => {
      for (const e of evs) eventos.set(e.polpTransactionId, { assetId: ctx.assetId, eventDate: e.eventDate })
      return evs.length
    },
    zerarAusentes: async (_ctx, kind, vistos, hoje) => {
      let n = 0
      for (const [polpId, assetId] of ativos) {
        if (tipoDe.get(polpId) !== kind || vistos.includes(polpId)) continue
        posicoes.set(`${assetId}|${hoje}`, { quantity: 0, grossCents: 0, netCents: 0 })
        zerados.push({ kind, assetId, hoje })
        n++
      }
      return n
    },
    registrarProblemas: async (_org, ps) => { problemas.push(...ps) },
    recalcularPosicoes: async () => { recalculos++ },
    vincularAplicacoes: async (conexao, accountId) => {
      vinculos.push({ connectionId: conexao.id, accountId })
      let n = 0
      for (const [id, destino] of orfas) {
        if (destino !== null) continue
        orfas.set(id, accountId)
        n++
      }
      return n
    },
  }
  return { repo, ativos, posicoes, eventos, problemas, zerados, orfas, vinculos, recalculos: () => recalculos }
}

const money = (amount: string) => ({ amount, currency: 'BRL' })
const fundo = (id: string) => ({
  id, name: `Fundo ${id}`, cnpj_number: '1',
  balance: { reference_date: '2026-09-22', quota_quantity: '10', gross_amount: money('100.00'), net_amount: money('95.00') },
})
const aplicacao = (id: string, data = '2026-09-01') => ({
  id, transaction_type: 'APLICACAO', transaction_conversion_date: data, transaction_quota_quantity: '10', transaction_value: money('100.00'),
})

function clienteFalso(
  porTipo: Partial<Record<PolpInvestmentKind, unknown[] | Error>>,
  movs: Record<string, unknown[]> = {},
  chamadas: Array<{ id: string; query: unknown }> = [],
) {
  return {
    async *streamInvestments(_c: string, kind: PolpInvestmentKind) {
      const v = porTipo[kind]
      if (v instanceof Error) throw v
      if (v) yield v
    },
    async *streamInvestmentTransactions(_k: PolpInvestmentKind, id: string, query?: unknown) {
      chamadas.push({ id, query })
      if (movs[id]) yield movs[id]
    },
  }
}

const CONEXAO = { id: 'c1', orgId: 'org-a', polpConsentId: 'consent-1', institutionName: 'Banco X', products: ['ACCOUNT', 'INVESTMENTS'] }

describe('sincronizarInvestimentos', () => {
  it('conexão sem INVESTMENTS não chama a Polp', async () => {
    const m = repoEmMemoria()
    const r = await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: new Error('não devia chamar') }), { ...CONEXAO, products: ['ACCOUNT'] })
    expect(r.ativos).toBe(0)
    expect(r.tiposComFalha).toEqual([])
  })

  it('grava ativo, posição e movimentações, e recalcula uma vez', async () => {
    const m = repoEmMemoria()
    const r = await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [fundo('f1')] }, { f1: [aplicacao('t1')] }), CONEXAO)
    expect(r).toMatchObject({ ativos: 1, posicoes: 1, movimentacoes: 1, conflitos: 0, rejeitados: 0 })
    expect(m.recalculos()).toBe(1)
  })

  it('rodar duas vezes no mesmo dia não duplica nada', async () => {
    const m = repoEmMemoria()
    const cliente = () => clienteFalso({ FUND: [fundo('f1')] }, { f1: [aplicacao('t1')] })
    await sincronizarInvestimentos(m.repo, cliente(), CONEXAO)
    await sincronizarInvestimentos(m.repo, cliente(), CONEXAO)
    expect(m.ativos.size).toBe(1)
    expect(m.posicoes.size).toBe(1)
    expect(m.eventos.size).toBe(1)
  })

  it('segunda passada pede movimentações a partir da última data menos 7 dias', async () => {
    const m = repoEmMemoria()
    const chamadas: Array<{ id: string; query: unknown }> = []
    await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [fundo('f1')] }, { f1: [aplicacao('t1', '2026-09-20')] }, chamadas), CONEXAO)
    await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [fundo('f1')] }, {}, chamadas), CONEXAO)
    expect(chamadas[0].query).toEqual({})
    expect(chamadas[1].query).toEqual({ fromDate: '2026-09-13T00:00:00Z' })
  })

  it('investimento de outra org: pula, conta conflito, registra problema', async () => {
    const m = repoEmMemoria({ f1: 'org-b' })
    const r = await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [fundo('f1')] }, { f1: [aplicacao('t1')] }), CONEXAO)
    expect(r.conflitos).toBe(1)
    expect(m.eventos.size).toBe(0)
    expect(m.problemas[0].reason).toMatch(/outra org/)
  })

  it('falha num tipo não impede os outros', async () => {
    const m = repoEmMemoria()
    const r = await sincronizarInvestimentos(m.repo, clienteFalso({ BANK_FIXED_INCOME: new Error('503'), FUND: [fundo('f1')] }), CONEXAO)
    expect(r.tiposComFalha).toEqual(['BANK_FIXED_INCOME'])
    expect(r.ativos).toBe(1)
    expect(m.problemas.some((p) => /BANK_FIXED_INCOME/.test(p.reason))).toBe(true)
  })

  it('item ilegível e tipo de movimentação novo viram problema, o resto entra', async () => {
    const m = repoEmMemoria()
    const r = await sincronizarInvestimentos(
      m.repo,
      clienteFalso({ FUND: [fundo('f1'), { name: 'sem id' }] }, { f1: [aplicacao('t1'), { ...aplicacao('t2'), transaction_type: 'BONIFICACAO' }] }),
      CONEXAO,
    )
    expect(r.ativos).toBe(1)
    expect(r.rejeitados).toBe(1)
    expect(r.movimentacoes).toBe(2)
    expect(m.problemas.some((p) => /BONIFICACAO/.test(p.reason))).toBe(true)
  })

  it('ativo que sumiu da listagem fica, mas com posição zerada na data de hoje', async () => {
    const m = repoEmMemoria()
    await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [fundo('f1'), fundo('f2')] }), CONEXAO, '2026-09-23')
    const r = await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [fundo('f2')] }), CONEXAO, '2026-09-24')
    expect(m.ativos.has('f1')).toBe(true)
    expect(m.zerados).toEqual([{ kind: 'FUND', assetId: 'asset-f1', hoje: '2026-09-24' }])
    expect(m.posicoes.get('asset-f1|2026-09-24')).toMatchObject({ quantity: 0, grossCents: 0, netCents: 0 })
    expect(r.zerados).toBe(1)
  })

  it('tipo que falhou na listagem não zera nada', async () => {
    const m = repoEmMemoria()
    await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [fundo('f1')] }), CONEXAO, '2026-09-23')
    const r = await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: new Error('503') }), CONEXAO, '2026-09-24')
    expect(m.zerados).toEqual([])
    expect(r.zerados).toBe(0)
  })

  it('item ilegível com id conta como visto; sem id, o tipo não é zerado', async () => {
    const m = repoEmMemoria()
    await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [fundo('f1'), fundo('f2')] }), CONEXAO, '2026-09-23')
    // f1 volta ilegível (mas com id): continua visto; f2 some → zera.
    const ilegivel = { ...fundo('f1'), balance: { ...fundo('f1').balance, gross_amount: money('abc') } }
    const r = await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [ilegivel] }), CONEXAO, '2026-09-24')
    expect(r.rejeitados).toBe(1)
    expect(m.zerados.map((z) => z.assetId)).toEqual(['asset-f2'])
    // Item sem id: não dá para saber quem ele é — não zera o tipo.
    await sincronizarInvestimentos(m.repo, clienteFalso({ FUND: [{ name: 'sem id' }] }), CONEXAO, '2026-09-25')
    expect(m.zerados.map((z) => z.assetId)).toEqual(['asset-f2'])
  })

  it('vincula aplicações e resgates órfãos à conta de investimentos, uma vez só', async () => {
    const m = repoEmMemoria({}, { apl: null, resg: null, manual: 'conta-escolhida' })
    const r1 = await sincronizarInvestimentos(m.repo, clienteFalso({}), CONEXAO)
    expect(r1.transferenciasVinculadas).toBe(2)
    expect(m.vinculos).toEqual([{ connectionId: 'c1', accountId: 'conta-inv' }])
    expect(m.orfas.get('manual')).toBe('conta-escolhida')
    const r2 = await sincronizarInvestimentos(m.repo, clienteFalso({}), CONEXAO)
    expect(r2.transferenciasVinculadas).toBe(0)
  })

  it('conexão sem INVESTMENTS (sem conta de investimentos) não vincula nada', async () => {
    const m = repoEmMemoria({}, { apl: null })
    const r = await sincronizarInvestimentos(m.repo, clienteFalso({}), { ...CONEXAO, products: ['ACCOUNT'] })
    expect(r.transferenciasVinculadas).toBe(0)
    expect(m.vinculos).toEqual([])
    expect(m.orfas.get('apl')).toBeNull()
  })
})
