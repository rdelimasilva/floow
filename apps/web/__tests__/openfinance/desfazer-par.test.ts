import { describe, it, expect } from 'vitest'
import { desfazerParDaRegra, type LancamentoDaRegra } from '@/lib/openfinance/desfazer-par'
import { fakeTx } from './_fake-tx'

const ORG = 'org-1'
const base: LancamentoDaRegra = { id: 'l1', accountId: 'itau', amountCents: 400100, description: 'Resgate CDB DI', transferGroupId: 'g1', balanceApplied: true, isIgnored: false }
const perna = (o: Partial<Record<string, unknown>> = {}) => ({ id: 'p1', accountId: 'xp', amountCents: -400100, externalId: 'ext:transfer-dest', balanceApplied: true, isIgnored: false, matchedTransactionId: null, ...o })

describe('desfazerParDaRegra', () => {
  it('perna real aplicada: estorna na outra conta, apaga a perna e volta a pendente', async () => {
    const { tx, ops } = fakeTx([[perna()]])
    const r = await desfazerParDaRegra(tx, ORG, base)
    expect(r.forma).toBe('perna-real')
    expect(r.estorno).toEqual({ xp: 400100 })
    expect(ops.map((o) => `${o.op}:${o.table}`)).toEqual(['select:transactions', 'update:accounts', 'delete:transactions', 'update:transactions'])
    expect(ops[3].set).toEqual({ reviewState: 'pending', transferGroupId: null, transferAccountId: null })
  })

  it('perna real ignorada: não estorna de novo', async () => {
    const { tx, ops } = fakeTx([[perna({ isIgnored: true })]])
    const r = await desfazerParDaRegra(tx, ORG, base)
    expect(r.estorno).toEqual({})
    expect(ops.some((o) => o.table === 'accounts')).toBe(false)
  })

  it('perna real não aplicada (futura): não estorna', async () => {
    const { tx } = fakeTx([[perna({ balanceApplied: false })]])
    expect((await desfazerParDaRegra(tx, ORG, base)).estorno).toEqual({})
  })

  it('perna prevista conciliada: apaga a perna e devolve o realizado a pendente', async () => {
    const { tx, ops } = fakeTx([[perna({ externalId: 'ext:transfer-par', balanceApplied: false, matchedTransactionId: 'r1' })]])
    const r = await desfazerParDaRegra(tx, ORG, base)
    expect(r.forma).toBe('perna-prevista')
    expect(r.realizadoDevolvidoId).toBe('r1')
    expect(ops.some((o) => o.table === 'accounts')).toBe(false)
    expect(ops.find((o) => o.op === 'update' && (o.set as any)?.transferAccountId === null && (o.set as any)?.reviewState === 'pending' && !('transferGroupId' in (o.set as any)))).toBeTruthy()
  })

  it('ponta esperada pelo outro lado: não toca em nada', async () => {
    const { tx, ops } = fakeTx([[{ id: 'perna-de-la', externalId: 'ext:transfer-par' }]])
    const r = await desfazerParDaRegra(tx, ORG, { ...base, transferGroupId: null })
    expect(r.forma).toBe('par-do-outro-lado')
    expect(ops.filter((o) => o.op !== 'select')).toEqual([])
  })

  it('sem grupo e sem ninguém esperando: só volta a pendente', async () => {
    const { tx, ops } = fakeTx([[], []])
    const r = await desfazerParDaRegra(tx, ORG, { ...base, transferGroupId: null })
    expect(r.forma).toBe('sem-par')
    expect(ops.filter((o) => o.op !== 'select').map((o) => `${o.op}:${o.table}`)).toEqual(['update:transactions'])
  })

  it('conciliado a previsão de template (não é perna): reprocessa, não é par do outro lado', async () => {
    const { tx, ops } = fakeTx([[{ id: 'previsao-aluguel', externalId: null }], []])
    const r = await desfazerParDaRegra(tx, ORG, { ...base, transferGroupId: null })
    expect(r.forma).toBe('sem-par')
    expect(ops.filter((o) => o.op !== 'select').map((o) => `${o.op}:${o.table}`)).toEqual(['update:transactions'])
  })

  it('proposta pendente contra previsão de template: reprocessa', async () => {
    const { tx } = fakeTx([[], [{ id: 'fmp1', externalId: 'tpl:2026-07' }]])
    expect((await desfazerParDaRegra(tx, ORG, { ...base, transferGroupId: null })).forma).toBe('sem-par')
  })

  it('proposta pendente contra perna prevista de outra conta: par do outro lado', async () => {
    const { tx, ops } = fakeTx([[], [{ id: 'fmp1', externalId: 'ext:transfer-par' }]])
    expect((await desfazerParDaRegra(tx, ORG, { ...base, transferGroupId: null })).forma).toBe('par-do-outro-lado')
    expect(ops.filter((o) => o.op !== 'select')).toEqual([])
  })

  it('membro do grupo com outro formato (lançamento real de outro banco): recusa sem escrever (achado 8)', async () => {
    const { tx, ops } = fakeTx([[perna({ externalId: 'pluggy-tx-123' })]])
    await expect(desfazerParDaRegra(tx, ORG, base)).rejects.toThrow('Par com formato inesperado; corrija manualmente.')
    expect(ops.filter((o) => o.op !== 'select')).toEqual([])
  })

  it('perna sem external_id (par manual) continua sendo desfeita', async () => {
    const { tx, ops } = fakeTx([[perna({ externalId: null })]])
    await desfazerParDaRegra(tx, ORG, base)
    expect(ops.some((o) => o.op === 'delete')).toBe(true)
  })
})
