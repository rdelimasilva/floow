import { describe, it, expect, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { inserirTransferenciaImportada } from '@/lib/finance/import-transfer'

const inserts: any[] = []
const updates: string[] = []
const selectQueue: unknown[][] = []
// O que o insert devolve em `returning`: vazio simula o conflito de FITID.
let origemInserida: unknown[] = [{ id: 'perna-origem' }]

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'set', 'onConflictDoNothing', 'returning']) c[m] = () => c
  return c
}
const tx: any = {
  select: () => chain(selectQueue.shift() ?? []),
  insert: () => ({ values: (v: unknown) => { inserts.push(v); return chain(inserts.length === 1 ? origemInserida : []) } }),
  update: (t: any) => { updates.push(getTableName(t)); return chain([]) },
}

const BASE = {
  orgId: 'org-1', accountId: 'itau', destAccountId: 'nubank', amountCents: -50000,
  description: 'TED', date: new Date('2026-09-10T12:00:00Z'), externalId: 'fitid-1',
  importedAt: new Date(), categoryId: null, contaImportadaAguarda: false,
}

beforeEach(() => {
  inserts.length = 0; updates.length = 0; selectQueue.length = 0
  origemInserida = [{ id: 'perna-origem' }]
})

describe('inserirTransferenciaImportada', () => {
  it('destino Open Finance: perna prevista, só o saldo da origem muda', async () => {
    selectQueue.push([{ id: 'recurso' }]) // linked
    const r = await inserirTransferenciaImportada(tx, BASE)
    expect(r.destinoPrevisto).toBe('nubank')
    expect(inserts[1]).toMatchObject({ accountId: 'nubank', externalId: 'fitid-1:transfer-par', balanceApplied: false })
    expect(updates).toEqual(['accounts'])
  })

  it('destino manual: duas pernas reais e dois saldos, como antes', async () => {
    selectQueue.push([]) // não linked
    const r = await inserirTransferenciaImportada(tx, BASE)
    expect(r.destinoPrevisto).toBeNull()
    expect(inserts[1]).toMatchObject({ accountId: 'nubank', amountCents: 50000 })
    expect(updates).toEqual(['accounts', 'accounts'])
  })

  // Duas transferências idênticas no mesmo CSV geram o mesmo FITID: a segunda
  // bate no índice único e não entra. Antes o saldo da origem era debitado
  // mesmo assim, e a perna de destino entrava sozinha, creditando a outra
  // conta — dois saldos errados e uma perna órfã.
  it('perna de origem repetida: não mexe em saldo nem cria o destino', async () => {
    origemInserida = []
    selectQueue.push([]) // não linked
    const r = await inserirTransferenciaImportada(tx, BASE)
    expect(r.inserida).toBe(false)
    expect(inserts).toHaveLength(1)
    expect(updates).toEqual([])
  })

  it('conta importada é Open Finance: a origem aguarda o extrato e não debita o saldo', async () => {
    selectQueue.push([]) // destino não linked
    await inserirTransferenciaImportada(tx, { ...BASE, contaImportadaAguarda: true })
    expect(inserts[0]).toMatchObject({ origem: 'arquivo', aguardaExtrato: true, balanceApplied: false })
    expect(updates).toEqual(['accounts']) // só o crédito da perna real no destino manual
  })

  it('destino Open Finance sem FITID: perna manual aguardando, sem crédito no destino', async () => {
    selectQueue.push([{ id: 'recurso' }]) // destino linked
    await inserirTransferenciaImportada(tx, { ...BASE, externalId: null })
    expect(inserts[1]).toMatchObject({ accountId: 'nubank', origem: 'perna', aguardaExtrato: true, balanceApplied: false })
    expect(updates).toEqual(['accounts']) // só o débito da origem
  })
})
