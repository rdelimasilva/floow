import { describe, it, expect } from 'vitest'
import { drizzle } from 'drizzle-orm/pg-proxy'
import type { NormalizedInvestmentEvent } from '@floow/core-finance'
import { criarRepositorio } from '@/lib/openfinance/investimentos/repositorio'

/**
 * O repositório só fala com o banco; aqui um driver falso guarda o SQL gerado
 * e os parâmetros, para prender os recortes que o teste em memória não vê.
 */
function dbQueGrava(resposta: (sql: string) => unknown[][] = () => []) {
  const consultas: Array<{ sql: string; params: unknown[] }> = []
  const db = drizzle(async (sql, params) => {
    consultas.push({ sql: sql.toLowerCase(), params })
    return { rows: resposta(sql.toLowerCase()) }
  })
  return { repo: criarRepositorio(db as never), consultas }
}

const evento = (id: string, totalCents: number): NormalizedInvestmentEvent => ({
  polpTransactionId: id, eventType: 'buy', unknownType: null, eventDate: '2026-09-01',
  quantity: 1, unitPrice: 1, priceCents: 7, totalCents, grossCents: totalCents, netCents: null,
  incomeTaxCents: null, notes: null,
})

describe('repositório de investimentos — SQL', () => {
  it('movimentação repetida no lote entra uma vez só (fica a última) e a contagem reflete isso', async () => {
    const { repo, consultas } = dbQueGrava()
    const n = await repo.salvarMovimentacoes(
      { orgId: 'org-1', accountId: 'conta-1', assetId: 'ativo-1' },
      [evento('t1', 100), evento('t2', 200), evento('t1', 300)],
    )
    expect(n).toBe(2)
    const insert = consultas.find((c) => c.sql.startsWith('insert into "portfolio_events"'))!
    expect(insert.params).toContain(300)
    expect(insert.params).not.toContain(100)
  })

  it('upsert de movimentação nunca reescreve evento de outra org', async () => {
    const { repo, consultas } = dbQueGrava()
    await repo.salvarMovimentacoes({ orgId: 'org-1', accountId: 'c', assetId: 'a' }, [evento('t1', 100)])
    const insert = consultas.find((c) => c.sql.startsWith('insert into "portfolio_events"'))!
    expect(insert.sql).toMatch(/do update set .* where "portfolio_events"\."org_id" = excluded\.org_id/)
  })

  it('zerarAusentes recorta por org, conexão, tipo e ids não vistos, e grava posição zero na data', async () => {
    const { repo, consultas } = dbQueGrava((sql) => (sql.startsWith('select') ? [['ativo-9']] : []))
    const n = await repo.zerarAusentes({ orgId: 'org-1', connectionId: 'con-1' }, 'FUND', ['f1', 'f2'], '2026-09-24')
    expect(n).toBe(1)
    const [select, insert] = consultas
    expect(select.sql).toContain('"connection_id" =')
    expect(select.sql).toContain('"resource_type" =')
    expect(select.sql).toContain('"polp_resource_id" not in')
    expect(select.params).toEqual(expect.arrayContaining(['org-1', 'con-1', 'FUND', 'f1', 'f2']))
    expect(insert.sql).toContain('insert into "asset_bank_positions"')
    expect(insert.params).toEqual(expect.arrayContaining(['org-1', 'ativo-9', '2026-09-24']))
  })

  it('zerarAusentes sem ausentes não grava nada', async () => {
    const { repo, consultas } = dbQueGrava()
    expect(await repo.zerarAusentes({ orgId: 'o', connectionId: 'c' }, 'FUND', [], '2026-09-24')).toBe(0)
    expect(consultas).toHaveLength(1)
    expect(consultas[0].sql).not.toContain('not in')
  })

  it('papel que volta à listagem sem saldo perde o zero de ausência', async () => {
    // CDB de banco em liquidação: listado, mas nunca com saldo. O zero gravado
    // no dia em que sumiu o escondia como encerrado para sempre.
    const { repo, consultas } = dbQueGrava((sql) =>
      sql.startsWith('select') ? [['res-1', 'org-1', 'ativo-1']] : [],
    )
    await repo.salvarInvestimento({ orgId: 'org-1', connectionId: 'con-1' }, {
      polpId: 'p1', kind: 'BANK_FIXED_INCOME', position: null,
      asset: { name: 'CDB', assetClass: 'fixed_income' },
    } as never)
    const del = consultas.find((c) => c.sql.startsWith('delete from "asset_bank_positions"'))
    expect(del).toBeDefined()
    expect(del!.params).toContain('ativo-1')
    expect(del!.sql).not.toContain('"reference_date" >')
  })
})
