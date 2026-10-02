import { describe, it, expect, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { criarPropostasDeTroca } from '@/lib/finance/conciliacao/troca'

/**
 * Vínculo errado bloqueia o certo em silêncio: caso de 01/10/2026, Jussara
 * 10/61 (R$ 3.600) presa à Unimed (R$ 3.314,17, 10 dias antes, nome sem
 * relação) e a TED dela de 01/10 (R$ 3.583) sem previsão para casar. A troca
 * só olha vínculo que a regra de hoje NÃO faria; vínculo plausível fica.
 */
const selectQueue: unknown[][] = []
const inserts: Record<string, unknown>[] = []
const wheres: SQL[] = []
const dialect = new PgDialect()

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'innerJoin', 'limit', 'returning', 'onConflictDoNothing']) c[m] = () => c
  c.where = (w: SQL) => { wheres.push(w); return c }
  c.values = (v: Record<string, unknown>) => { inserts.push(v); return c }
  return c
}
const db: any = { select: () => chain(selectQueue.shift() ?? []), insert: () => chain([{ id: 'nova' }]) }

const JUSSARA_PRESA_NA_UNIMED = {
  id: 'j10', amountCents: -360000, date: '2026-10-01', description: 'Jussara - Diarista (10/61)',
  atualId: 'unimed', atualAmountCents: -331417, atualDate: '2026-09-21', atualDescription: 'Unimed Cnu',
}
const TIM_BEM_VINCULADA = {
  id: 'tim', amountCents: -15900, date: '2026-09-15', description: 'TIM internet (6/61)',
  atualId: 'da-tim', atualAmountCents: -15999, atualDate: '2026-09-22', atualDescription: 'Débito automático DA TIM CEL',
}
const TED_JUSSARA = { id: 'ted', amountCents: -358300, date: '2026-10-01', description: 'TED enviada jussara leoncio de andrade' }

beforeEach(() => { selectQueue.length = 0; inserts.length = 0; wheres.length = 0 })

describe('criarPropostasDeTroca', () => {
  it('caso de 01/10: propõe trocar a Unimed pela TED da Jussara', async () => {
    selectQueue.push([JUSSARA_PRESA_NA_UNIMED, TIM_BEM_VINCULADA], [TED_JUSSARA])
    expect(await criarPropostasDeTroca(db, 'org-1', 'itau')).toBe(1)
    expect(inserts).toEqual([{ orgId: 'org-1', forecastTransactionId: 'j10', realizedTransactionId: 'ted', status: 'pending', substituiTransactionId: 'unimed' }])
  })

  it('vínculo que a regra faria hoje não é contestado: nem busca realizado', async () => {
    selectQueue.push([TIM_BEM_VINCULADA])
    expect(await criarPropostasDeTroca(db, 'org-1', 'itau')).toBe(0)
    expect(wheres).toHaveLength(1)
    expect(inserts).toHaveLength(0)
  })

  it('lançamento livre que também não casa (Diagonal, 10,5% e nome sem relação) não vira troca', async () => {
    selectQueue.push([JUSSARA_PRESA_NA_UNIMED], [{ id: 'diagonal', amountCents: -322000, date: '2026-09-29', description: 'Diagonal Projetos e Engenharia' }])
    expect(await criarPropostasDeTroca(db, 'org-1', 'itau')).toBe(0)
  })

  it('cada previsão recebe uma troca só por passada', async () => {
    selectQueue.push([JUSSARA_PRESA_NA_UNIMED], [TED_JUSSARA, { ...TED_JUSSARA, id: 'ted-2' }])
    expect(await criarPropostasDeTroca(db, 'org-1', 'itau')).toBe(1)
  })

  it('previsão presa: recorrência da conta, sem proposta aberta; realizado: livre e sem proposta pendente', async () => {
    selectQueue.push([JUSSARA_PRESA_NA_UNIMED], [])
    await criarPropostasDeTroca(db, 'org-1', 'itau')
    const presas = dialect.sqlToQuery(wheres[0]).sql.toLowerCase()
    expect(presas).toContain('"recurring_template_id" is not null')
    expect(presas).toContain('"aguarda_extrato" = $')
    expect(presas).toContain('forecast_match_proposals')
    const livres = dialect.sqlToQuery(wheres[1]).sql.toLowerCase()
    expect(livres).toContain('"external_id" is not null')
    expect(livres).toMatch(/realized_transaction_id[\s\S]*pending/)
  })
})
