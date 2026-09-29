import { describe, it, expect, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { inserirLinhasDoArquivo } from '@/lib/finance/import-linhas'

const inseridas: Record<string, unknown>[][] = []
const updates: string[] = []
let retornoDoInsert: unknown[] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['where', 'set', 'onConflictDoNothing', 'returning']) c[m] = () => c
  return c
}
const tx: any = {
  insert: () => ({ values: (v: Record<string, unknown>[]) => { inseridas.push(v); return chain(retornoDoInsert) } }),
  update: (t: any) => { updates.push(getTableName(t)); return chain([]) },
}

const LINHA = { orgId: 'org-1', accountId: 'nubank', type: 'expense' as const, amountCents: -4321, description: 'LUZ', date: new Date('2026-09-20T12:00:00Z'), externalId: 'fitid-1' }

beforeEach(() => { inseridas.length = 0; updates.length = 0; retornoDoInsert = [{ id: 'l1', amountCents: -4321 }] })

describe('inserirLinhasDoArquivo', () => {
  it('conta manual: origem arquivo, no saldo, soma o que entrou', async () => {
    const n = await inserirLinhasDoArquivo(tx, { accountId: 'itau', linhas: [LINHA], aguardaExtrato: false })
    expect(n).toBe(1)
    expect(inseridas[0][0]).toMatchObject({ origem: 'arquivo', aguardaExtrato: false, balanceApplied: true })
    expect(updates).toEqual(['accounts'])
  })

  it('conta Open Finance: aguarda o extrato e não mexe no saldo', async () => {
    await inserirLinhasDoArquivo(tx, { accountId: 'nubank', linhas: [LINHA], aguardaExtrato: true })
    expect(inseridas[0][0]).toMatchObject({ origem: 'arquivo', aguardaExtrato: true, balanceApplied: false })
    expect(updates).toEqual([])
  })

  it('lista vazia: não grava nada', async () => {
    expect(await inserirLinhasDoArquivo(tx, { accountId: 'x', linhas: [], aguardaExtrato: false })).toBe(0)
    expect(inseridas).toEqual([])
  })
})
