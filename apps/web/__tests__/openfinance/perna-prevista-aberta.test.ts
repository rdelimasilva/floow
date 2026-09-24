import { describe, it, expect } from 'vitest'
import { drizzle } from 'drizzle-orm/pg-proxy'
import { acharPernaPrevistaAberta } from '@/lib/openfinance/perna-prevista-aberta'

/**
 * OF↔OF com as duas contrapartes confirmadas: o primeiro lado a chegar cria a
 * perna prevista na conta do outro. Quando o outro lado chega, esta busca é o
 * que impede a segunda perna — ele acha a previsão que já o espera.
 */

function dbFalso(linhas: unknown[][]) {
  const consultas: Array<{ sql: string; params: unknown[] }> = []
  const db = drizzle(async (sql, params) => {
    consultas.push({ sql: sql.toLowerCase(), params })
    return { rows: linhas }
  })
  return { db: db as never, consultas }
}

const DATA = new Date('2026-09-10T12:00:00Z')

describe('acharPernaPrevistaAberta', () => {
  it('procura perna prevista aberta, na conta do lançamento, vinda da outra conta, com o mesmo valor', async () => {
    const { db, consultas } = dbFalso([])
    const achada = await acharPernaPrevistaAberta(db, 'org-1', {
      contaDoLancamento: 'nubank', outraConta: 'itau', amountCents: 50_000, date: DATA,
    })

    expect(achada).toBeNull()
    const [q] = consultas
    expect(q.sql).toContain('"external_id" like')
    expect(q.params).toContain('%:transfer-par')
    expect(q.sql).toContain('"balance_applied" =')
    expect(q.sql).toContain('"matched_transaction_id" is null')
    expect(q.sql).toContain('"is_ignored" =')
    expect(q.sql).toContain('"transfer_account_id" =')
    expect(q.sql).toContain('"amount_cents" =')
    expect(q.params).toEqual(expect.arrayContaining(['org-1', 'nubank', 'itau', 50_000]))
  })

  it('só dentro de 7 dias em volta da data do lançamento', async () => {
    const { db, consultas } = dbFalso([])
    await acharPernaPrevistaAberta(db, 'org-1', { contaDoLancamento: 'nubank', outraConta: 'itau', amountCents: 50_000, date: DATA })

    const [q] = consultas
    expect(q.sql).toContain('"date" >=')
    expect(q.sql).toContain('"date" <=')
    const datas = q.params.filter((p): p is string => typeof p === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p))
    expect(datas.map((d) => d.slice(0, 10)).sort()).toEqual(['2026-09-03', '2026-09-17'])
  })

  it('devolve o id da perna quando acha', async () => {
    const { db } = dbFalso([['perna-1']])
    const achada = await acharPernaPrevistaAberta(db, 'org-1', {
      contaDoLancamento: 'nubank', outraConta: 'itau', amountCents: 50_000, date: DATA,
    })
    expect(achada).toBe('perna-1')
  })
})
