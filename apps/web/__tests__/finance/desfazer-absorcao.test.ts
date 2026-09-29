import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { devolucaoDoExtrato } from '@/lib/finance/conciliacao/desfazer-absorcao'
import { desconciliarNoBanco } from '@/lib/finance/desconciliar-db'
import { desfazerParDaRegra, type LancamentoDaRegra } from '@/lib/openfinance/desfazer-par'
import { fakeTx, type FakeOp } from '../openfinance/_fake-tx'

/**
 * Desfazer uma absorção (R1 ou aprovação de linha que aguardava o extrato)
 * devolve o extrato ao que ele era antes de ganhar o efeito: perna volta a
 * transferência sem conta, pendente em Classificar (como o desfazer da
 * `:transfer-par` já fazia); manual/arquivo volta a pendente de revisão
 * mantendo a categoria — o estado anterior não é guardado (Ruling P10).
 */

const ORG = 'org-1'
const dialect = new PgDialect()
const paramsDo = (o: FakeOp) => dialect.sqlToQuery(o.where as SQL).params
const escritas = (ops: FakeOp[]) => ops.filter((o) => o.op !== 'select')

describe('devolucaoDoExtrato', () => {
  it('perna :transfer-dest absorvida: transferência sem conta, pendente', () => {
    expect(devolucaoDoExtrato({ origem: 'perna', aguardaExtrato: true, externalId: 'itau-1:transfer-dest', matchedTransactionId: 'ext' }))
      .toEqual({ reviewState: 'pending', transferAccountId: null })
  })

  it('perna :transfer-par antiga, mesmo sem origem lida: igual', () => {
    expect(devolucaoDoExtrato({ externalId: 'itau-1:transfer-par', matchedTransactionId: 'ext' }))
      .toEqual({ reviewState: 'pending', transferAccountId: null })
  })

  it('manual ou arquivo absorvido: só volta a pendente, categoria fica', () => {
    expect(devolucaoDoExtrato({ origem: 'manual', aguardaExtrato: true, externalId: null, matchedTransactionId: 'ext' })).toEqual({ reviewState: 'pending' })
    expect(devolucaoDoExtrato({ origem: 'arquivo', aguardaExtrato: true, externalId: 'ofx-1', matchedTransactionId: 'ext' })).toEqual({ reviewState: 'pending' })
  })

  it('previsão de recorrência cumprida: o extrato não tinha mudado, nada a devolver', () => {
    expect(devolucaoDoExtrato({ origem: 'recorrencia', aguardaExtrato: false, externalId: null, matchedTransactionId: 'ext' })).toBeNull()
  })

  it('sem vínculo: nada a devolver', () => {
    expect(devolucaoDoExtrato({ origem: 'perna', aguardaExtrato: true, externalId: 'x:transfer-dest', matchedTransactionId: null })).toBeNull()
  })
})

const linhaBase = {
  accountId: 'nubank', amountCents: 20000, description: 'x', transferGroupId: null, balanceApplied: true,
  isIgnored: false, counterpartyId: null, reviewState: 'confirmed', matchedTransactionId: null,
}

describe('desconciliarNoBanco — absorção', () => {
  it('clicou no extrato que absorveu a :transfer-dest: solta o vínculo, reabre a proposta e devolve o extrato a Classificar', async () => {
    const { tx, ops } = fakeTx([
      [{ ...linhaBase, id: 'ext-18', externalId: 'pluggy-18', counterpartyId: 'cp', origem: 'extrato', aguardaExtrato: false }],
      [{ id: 'perna-18', origem: 'perna', aguardaExtrato: true, externalId: 'itau-18:transfer-dest' }],
    ])
    expect(await desconciliarNoBanco(tx, ORG, 'ext-18')).toBe('previsoes')
    const e = escritas(ops)
    expect(e.map((o) => `${o.op}:${o.table}`)).toEqual(['update:transactions', 'insert:forecast_match_proposals', 'update:transactions'])
    expect(e[0].set).toEqual({ matchedTransactionId: null })
    expect(paramsDo(e[0])).toContain('perna-18')
    expect(e[2].set).toEqual({ reviewState: 'pending', transferAccountId: null })
    expect(paramsDo(e[2])).toContain('ext-18')
  })

  it('clicou no lançamento manual absorvido: o extrato volta a pendente mantendo a categoria', async () => {
    const { tx, ops } = fakeTx([
      [{ ...linhaBase, id: 'm', externalId: null, matchedTransactionId: 'ext', origem: 'manual', aguardaExtrato: true }],
    ])
    await desconciliarNoBanco(tx, ORG, 'm')
    const e = escritas(ops)
    expect(e.at(-1)?.set).toEqual({ reviewState: 'pending' })
    expect(paramsDo(e.at(-1)!)).toContain('ext')
  })

  it('arquivo absorvido: igual ao manual', async () => {
    const { tx, ops } = fakeTx([
      [{ ...linhaBase, id: 'a', externalId: 'ofx-1', matchedTransactionId: 'ext', origem: 'arquivo', aguardaExtrato: true }],
    ])
    await desconciliarNoBanco(tx, ORG, 'a')
    expect(escritas(ops).at(-1)?.set).toEqual({ reviewState: 'pending' })
  })

  it('previsão de recorrência: só o vínculo e a proposta, o extrato não é tocado', async () => {
    const { tx, ops } = fakeTx([
      [{ ...linhaBase, id: 'prev', externalId: null, matchedTransactionId: 'ext', origem: 'recorrencia', aguardaExtrato: false }],
    ])
    await desconciliarNoBanco(tx, ORG, 'prev')
    expect(escritas(ops).map((o) => `${o.op}:${o.table}`)).toEqual(['update:transactions', 'insert:forecast_match_proposals'])
  })
})

const base: LancamentoDaRegra = { id: 'l1', accountId: 'itau', amountCents: -20000, description: 'Pix enviado', transferGroupId: 'g1', balanceApplied: true, isIgnored: false }

describe('desfazerParDaRegra — perna absorvida por R1', () => {
  it(':transfer-dest aguardando, absorvida: apaga a perna, sem estorno, e devolve o extrato que a absorveu', async () => {
    const { tx, ops } = fakeTx([[{
      id: 'p1', accountId: 'nubank', amountCents: 20000, externalId: 'itau-1:transfer-dest', balanceApplied: false,
      isIgnored: false, matchedTransactionId: 'ext-18', origem: 'perna', aguardaExtrato: true,
    }]])
    const r = await desfazerParDaRegra(tx, ORG, base)
    expect(r.realizadoDevolvidoId).toBe('ext-18')
    expect(ops.some((o) => o.table === 'accounts')).toBe(false)
    const devolucao = escritas(ops).find((o) => o.op === 'update' && paramsDo(o).includes('ext-18'))
    expect(devolucao?.set).toEqual({ reviewState: 'pending', transferAccountId: null })
    expect(ops.some((o) => o.op === 'delete')).toBe(true)
  })

  it('extrato sem grupo que absorveu a :transfer-dest de outra conta: par do outro lado', async () => {
    const { tx, ops } = fakeTx([[{ id: 'perna-de-la', externalId: 'itau-1:transfer-dest', origem: 'perna' }]])
    const r = await desfazerParDaRegra(tx, ORG, { ...base, transferGroupId: null })
    expect(r.forma).toBe('par-do-outro-lado')
    expect(escritas(ops)).toEqual([])
  })

  it('proposta pendente contra :transfer-dest de outra conta: par do outro lado', async () => {
    const { tx } = fakeTx([[], [{ id: 'fmp1', externalId: 'itau-1:transfer-dest', origem: 'perna' }]])
    expect((await desfazerParDaRegra(tx, ORG, { ...base, transferGroupId: null })).forma).toBe('par-do-outro-lado')
  })

  it('extrato que absorveu um manual: não é par do outro lado, a regra daqui reprocessa', async () => {
    const { tx } = fakeTx([[{ id: 'm', externalId: null, origem: 'manual' }], []])
    expect((await desfazerParDaRegra(tx, ORG, { ...base, transferGroupId: null })).forma).toBe('sem-par')
  })
})
