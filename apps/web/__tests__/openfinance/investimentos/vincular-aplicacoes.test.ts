import { describe, it, expect } from 'vitest'
import { drizzle } from 'drizzle-orm/pg-proxy'
import {
  montarVinculos, vincularAplicacoesOrfas, type AplicacaoOrfa,
} from '@/lib/openfinance/investimentos/vincular-aplicacoes'

const DATA = new Date('2026-09-10T12:00:00Z')
const orfa = (over: Partial<AplicacaoOrfa> = {}): AplicacaoOrfa => ({
  id: 'tx-1', orgId: 'org-a', amountCents: -50_000, date: DATA,
  externalId: 'ext-1', balanceApplied: true, transferGroupId: null, transferAccountId: null,
  ...over,
})
let n = 0
const grupo = () => `grupo-${++n}`

describe('montarVinculos (puro)', () => {
  it('aplicação órfã: vincula à conta de investimentos e a perna entra com sinal oposto', () => {
    n = 0
    const [v] = montarVinculos([orfa()], 'conta-inv', grupo)
    expect(v.id).toBe('tx-1')
    expect(v.transferGroupId).toBe('grupo-1')
    expect(v.perna).toMatchObject({
      orgId: 'org-a', accountId: 'conta-inv', type: 'transfer', amountCents: 50_000,
      transferGroupId: 'grupo-1', externalId: 'ext-1:transfer-dest', balanceApplied: true,
      description: 'Transferência recebida', reviewState: 'confirmed',
    })
  })

  it('resgate: a perna debita a conta de investimentos (direção inversa)', () => {
    const [v] = montarVinculos([orfa({ amountCents: 30_000 })], 'conta-inv', grupo)
    expect(v.perna.amountCents).toBe(-30_000)
    expect(v.perna.description).toBe('Transferência enviada')
  })

  it('origem não aplicada: a perna herda balanceApplied false', () => {
    const [v] = montarVinculos([orfa({ balanceApplied: false })], 'conta-inv', grupo)
    expect(v.perna.balanceApplied).toBe(false)
  })

  it('reaproveita o transfer_group_id que a linha já tiver', () => {
    const [v] = montarVinculos([orfa({ transferGroupId: 'g-antigo' })], 'conta-inv', grupo)
    expect(v.transferGroupId).toBe('g-antigo')
    expect(v.perna.transferGroupId).toBe('g-antigo')
  })

  it('linha que já tem conta de destino fica de fora (escolha manual vence)', () => {
    expect(montarVinculos([orfa({ transferAccountId: 'outra' })], 'conta-inv', grupo)).toEqual([])
  })

  it('sem conta de investimentos: nada', () => {
    expect(montarVinculos([orfa()], null, grupo)).toEqual([])
  })
})

/** Driver falso: grava o SQL e responde por prefixo. Transação roda direto. */
function dbFalso(resposta: (sql: string, params: unknown[]) => unknown[][]) {
  const consultas: Array<{ sql: string; params: unknown[] }> = []
  const db = drizzle(async (sql, params) => {
    const s = sql.toLowerCase()
    consultas.push({ sql: s, params })
    return { rows: resposta(s, params) }
  }) as unknown as { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> }
  db.transaction = (fn) => fn(db)
  return { db: db as never, consultas }
}

// select: id, amount_cents, date, external_id, balance_applied, transfer_group_id
const linha = (id: string, amount: number, applied = true) => [id, amount, DATA.toISOString(), `ext-${id}`, applied, null]

describe('vincularAplicacoesOrfas (SQL)', () => {
  it('recorta por org, contas da conexão, polp_type, transferência sem destino e não ignorada', async () => {
    const { db, consultas } = dbFalso(() => [])
    const r = await vincularAplicacoesOrfas(db, { id: 'con-1', orgId: 'org-a' }, 'conta-inv')
    expect(r).toBe(0)
    expect(consultas).toHaveLength(1)
    const [sel] = consultas
    expect(sel.sql).toContain('"polp_type" in')
    expect(sel.sql).toContain('"transfer_account_id" is null')
    expect(sel.sql).toContain('"is_ignored" =')
    expect(sel.sql).toContain('"openfinance_resources"')
    expect(sel.params).toEqual(expect.arrayContaining([
      'org-a', 'con-1', 'ACCOUNT', 'transfer', 'APLICACAO_FINANCEIRA', 'RESGATE_APLIC_FINANCEIRA',
    ]))
  })

  it('vincula, cria a perna idempotente e move o saldo só das pernas aplicadas que entraram', async () => {
    const { db, consultas } = dbFalso((s, params) => {
      if (s.startsWith('select')) return [linha('a', -50_000), linha('b', 20_000, false)]
      if (s.startsWith('update "transactions"')) return [[params.find((p) => p === 'a' || p === 'b')]]
      if (s.startsWith('insert into "transactions"')) return [['conta-inv', 50_000, true], ['conta-inv', -20_000, false]]
      return []
    })
    const r = await vincularAplicacoesOrfas(db, { id: 'con-1', orgId: 'org-a' }, 'conta-inv')
    expect(r).toBe(2)
    const updates = consultas.filter((c) => c.sql.startsWith('update "transactions"'))
    expect(updates).toHaveLength(2)
    for (const u of updates) {
      expect(u.sql).toContain('"transfer_account_id" is null')
      expect(u.params).toEqual(expect.arrayContaining(['conta-inv', 'org-a']))
    }
    const insert = consultas.find((c) => c.sql.startsWith('insert into "transactions"'))!
    expect(insert.sql).toContain('on conflict do nothing')
    expect(insert.params).toEqual(expect.arrayContaining(['ext-a:transfer-dest', 'ext-b:transfer-dest']))
    const saldo = consultas.filter((c) => c.sql.startsWith('update "accounts"'))
    expect(saldo).toHaveLength(1)
    expect(saldo[0].params).toEqual(expect.arrayContaining([50_000, 'conta-inv', 'org-a']))
  })

  it('linha que outra corrida já vinculou não ganha perna (segunda passada não duplica)', async () => {
    const { db, consultas } = dbFalso((s) => (s.startsWith('select') ? [linha('a', -50_000)] : []))
    const r = await vincularAplicacoesOrfas(db, { id: 'con-1', orgId: 'org-a' }, 'conta-inv')
    expect(r).toBe(0)
    expect(consultas.some((c) => c.sql.startsWith('insert'))).toBe(false)
    expect(consultas.some((c) => c.sql.startsWith('update "accounts"'))).toBe(false)
  })

  it('perna que já existia (conflito) não move saldo', async () => {
    const { db, consultas } = dbFalso((s, params) => {
      if (s.startsWith('select')) return [linha('a', -50_000)]
      if (s.startsWith('update "transactions"')) return [[params.find((p) => p === 'a')]]
      return []
    })
    expect(await vincularAplicacoesOrfas(db, { id: 'con-1', orgId: 'org-a' }, 'conta-inv')).toBe(1)
    expect(consultas.some((c) => c.sql.startsWith('update "accounts"'))).toBe(false)
  })
})
