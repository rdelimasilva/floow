import { describe, it, expect, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { gravarLinhasDoArquivo, inserirLinhasDoArquivo } from '@/lib/finance/import-linhas'

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

describe('gravarLinhasDoArquivo', () => {
  // Um arquivo pode trazer histórico de antes do início do extrato: esse
  // pedaço fica no saldo, porque nenhum extrato vai cobri-lo.
  it('conta OF: decide linha a linha pelo início do extrato', async () => {
    const ANTIGA = { ...LINHA, externalId: 'fitid-0', date: new Date('2026-08-20T00:00:00Z') }
    await gravarLinhasDoArquivo(tx, { accountId: 'nubank', linhas: [ANTIGA, LINHA], extrato: { conciliavel: true, desde: '2026-09-01' } })
    expect(inseridas).toHaveLength(2)
    expect(inseridas[0]).toEqual([expect.objectContaining({ externalId: 'fitid-0', aguardaExtrato: false, balanceApplied: true })])
    expect(inseridas[1]).toEqual([expect.objectContaining({ externalId: 'fitid-1', aguardaExtrato: true, balanceApplied: false })])
    expect(updates).toEqual(['accounts']) // só a antiga soma no saldo
  })

  it('conta manual: tudo no saldo, num insert só', async () => {
    await gravarLinhasDoArquivo(tx, { accountId: 'itau', linhas: [LINHA], extrato: { conciliavel: false } })
    expect(inseridas).toHaveLength(1)
    expect(inseridas[0][0]).toMatchObject({ aguardaExtrato: false, balanceApplied: true })
  })
})
