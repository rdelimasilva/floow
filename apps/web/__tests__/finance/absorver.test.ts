import { describe, it, expect, beforeEach } from 'vitest'
import { absorverNoBanco } from '@/lib/finance/conciliacao/absorver'

/** Fila de retornos: [0] o UPDATE condicional da provisória, depois os selects. */
let retornosDoUpdate: unknown[][] = []
let retornosDoSelect: unknown[][] = []
const sets: Record<string, unknown>[] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'returning']) c[m] = () => c
  return c
}
const db: any = {
  update: () => ({ set: (p: Record<string, unknown>) => { sets.push(p); return chain(retornosDoUpdate.shift() ?? []) } }),
  // Devolve só as colunas pedidas, como o banco: o código tem de pedir o que usa.
  select: (campos: Record<string, unknown>) =>
    chain((retornosDoSelect.shift() ?? []).map((l) => Object.fromEntries(Object.keys(campos).map((k) => [k, (l as Record<string, unknown>)[k]])))),
}

const EXTRATO_PENDENTE = { reviewState: 'pending', categoryId: null, isAutoCategorized: false }

beforeEach(() => { retornosDoUpdate = []; retornosDoSelect = []; sets.length = 0 })

describe('absorverNoBanco', () => {
  it(':transfer-dest do caso de 28/09: vínculo na perna e o extrato vira transferência vinda do Itaú', async () => {
    retornosDoUpdate = [[{ id: 'perna-18', origem: 'perna', categoryId: null, description: 'Transferência recebida', transferAccountId: null, transferGroupId: 'g-18' }]]
    retornosDoSelect = [[EXTRATO_PENDENTE], [{ accountId: 'itau' }]]
    const ok = await absorverNoBanco(db, 'org-1', { aguardandoId: 'perna-18', extratoId: 'ext-18' })
    expect(ok).toBe(true)
    expect(sets[0]).toEqual({ matchedTransactionId: 'ext-18' })
    expect(sets[1]).toEqual({ type: 'transfer', categoryId: null, reviewState: 'confirmed', transferAccountId: 'itau' })
    expect(sets[1]).not.toHaveProperty('transferGroupId')
  })

  it('outro sync ganhou a corrida (UPDATE condicional não pegou nada): não toca no extrato', async () => {
    retornosDoUpdate = [[]]
    const ok = await absorverNoBanco(db, 'org-1', { aguardandoId: 'a', extratoId: 'e' })
    expect(ok).toBe(false)
    expect(sets).toHaveLength(1)
  })

  it('manual: o extrato herda categoria e descrição', async () => {
    retornosDoUpdate = [[{ id: 'm', origem: 'manual', categoryId: 'cat-feira', description: 'Feira', transferAccountId: null, transferGroupId: null }]]
    retornosDoSelect = [[EXTRATO_PENDENTE]]
    await absorverNoBanco(db, 'org-1', { aguardandoId: 'm', extratoId: 'e' })
    expect(sets[1]).toEqual({ categoryId: 'cat-feira', description: 'Feira', reviewState: 'confirmed', isAutoCategorized: false })
  })

  it('espelho OF↔OF: extrato já em outro grupo só ganha o vínculo, tipo e categoria ficam', async () => {
    retornosDoUpdate = [[{ id: 'perna-g1', origem: 'perna', categoryId: null, description: 'Transferência recebida', transferAccountId: null, transferGroupId: 'g1' }]]
    retornosDoSelect = [[{ ...EXTRATO_PENDENTE, reviewState: 'confirmed', transferGroupId: 'g2' }], [{ accountId: 'itau' }]]
    const ok = await absorverNoBanco(db, 'org-1', { aguardandoId: 'perna-g1', extratoId: 'ext-g2' })
    expect(ok).toBe(true)
    expect(sets).toEqual([{ matchedTransactionId: 'ext-g2' }])
  })
})
