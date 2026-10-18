import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

vi.mock('@/lib/finance/conciliacao/validacoes', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  registrarEventos: vi.fn(async () => {}),
}))

const { herdarCategoriaDosVinculos } = await import('@/lib/finance/conciliacao/herdar-categoria')
const { registrarEventos } = await import('@/lib/finance/conciliacao/validacoes')

let devolve: unknown[] = []
const consultas: { sql: string; params: unknown[] }[] = []
const db: any = {
  execute: async (q: SQL) => { consultas.push(new PgDialect().sqlToQuery(q)); return devolve },
}

beforeEach(() => { devolve = []; consultas.length = 0; vi.clearAllMocks() })

describe('herdarCategoriaDosVinculos', () => {
  it('só mexe no lançamento desta conta e org, preso a recorrência, com categoria automática e sem decisão do usuário', async () => {
    await herdarCategoriaDosVinculos(db, 'org-1', 'itau')
    const { sql, params } = consultas[0]
    expect(params).toEqual(expect.arrayContaining(['org-1', 'itau', 'confirmar', 'corrigir', 'edicao']))
    expect(params).not.toContain('legado')
    expect(sql).toContain('p.recurring_template_id is not null')
    expect(sql).toContain("r.review_state = 'confirmed'")
    expect(sql).toContain('(r.is_auto_categorized or r.category_id is null)')
    expect(sql).toContain('r.transfer_group_id is null')
    expect(sql).toContain('coalesce(rt.category_id, p.category_id)')
    // Nunca por uma mais genérica: a alvo não pode ser ancestral da atual.
    expect(sql).toContain('coalesce(rt.category_id, p.category_id) not in (')
    expect(sql).toMatch(/with recursive sobe[\s\S]*c\.id = r\.category_id[\s\S]*select parent_id from sobe/)
    // Idempotente: quem herda sai do recorte.
    expect(sql).toContain('is_auto_categorized = false')
  })

  it('cada herança vira evento vinculo na medição', async () => {
    devolve = [{ id: 'pix-flavio', counterparty_id: 'cp-1', type: 'expense', category_id: 'psicologo' }]
    expect(await herdarCategoriaDosVinculos(db, 'org-1', 'itau')).toBe(1)
    expect(registrarEventos).toHaveBeenCalledWith(db, 'org-1', 'vinculo', null, [
      { transactionId: 'pix-flavio', counterpartyId: 'cp-1', natureza: 'expense', categoriaId: 'psicologo' },
    ])
  })
})
