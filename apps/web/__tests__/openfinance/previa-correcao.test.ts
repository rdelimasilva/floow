import { describe, it, expect } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { selecionarLancamentosDaRegra, somarPrevia } from '@/lib/openfinance/previa-correcao'
import { fakeTx } from './_fake-tx'

const dialect = new PgDialect()

const l = (id: string, amountCents: number) => ({ id, accountId: 'itau', amountCents, description: 'Resgate CDB DI', transferGroupId: 'g', balanceApplied: true, isIgnored: false })

describe('somarPrevia', () => {
  it('XP → Itaú - Corretora (manual): estorno na XP e débito espelhado na nova', () => {
    const p = somarPrevia([
      { l: l('a', 400100), forma: 'perna-real', estorno: { xp: 400100 } },
      { l: l('b', 20084), forma: 'perna-real', estorno: { xp: 20084 } },
    ], 'corretora')
    expect(p).toEqual({ mudam: 2, foraPorParDoOutroLado: [], deltas: { xp: 420184, corretora: -420184 }, naContaNova: 0 })
  })
  it('par do outro lado fica fora e não entra no delta', () => {
    const p = somarPrevia([{ l: l('a', 100), forma: 'par-do-outro-lado', estorno: {} }], 'corretora')
    expect(p).toEqual({ mudam: 0, foraPorParDoOutroLado: [{ id: 'a', description: 'Resgate CDB DI' }], deltas: {}, naContaNova: 0 })
  })
  it('nova decisão sem conta manual (receita, OF ou CPF próprio): só o estorno', () => {
    expect(somarPrevia([{ l: l('a', 100), forma: 'perna-real', estorno: { xp: 100 } }], null).deltas).toEqual({ xp: 100 })
  })
  it('lançamento não aplicado não gera débito na conta nova', () => {
    const naoAplicado = { ...l('a', 100), balanceApplied: false }
    expect(somarPrevia([{ l: naoAplicado, forma: 'sem-par', estorno: {} }], 'corretora').deltas).toEqual({})
  })
  it('lançamento ignorado não gera débito na conta nova (achado 3)', () => {
    const ignorado = { ...l('a', 100), isIgnored: true }
    expect(somarPrevia([{ l: ignorado, forma: 'sem-par', estorno: {} }], 'corretora').deltas).toEqual({})
  })
  it('conta os selecionados que já estão na conta nova (achado 4)', () => {
    const p = somarPrevia([
      { l: l('a', 100), forma: 'sem-par', estorno: {} },
      { l: { ...l('b', 100), accountId: 'corretora' }, forma: 'sem-par', estorno: {} },
    ], 'corretora', 'corretora')
    expect(p.naContaNova).toBe(1)
  })
})

describe('selecionarLancamentosDaRegra — o que está diferente da decisão nova', () => {
  const regra = { id: 'cp', nature: 'transfer' as const, categoryId: null, transferAccountId: 'corretora' }

  it('transferência para a conta nova: pega o que não é transferência para ela, inclusive o que ficou na conta antiga', async () => {
    // Caso real: a regra já foi salva sem histórico apontando para a
    // Corretora, e os lançamentos antigos continuam na XP. Selecionar pela
    // regra atual não achava nenhum.
    const { tx, ops } = fakeTx([[]])
    await selecionarLancamentosDaRegra(tx, 'org-1', regra, { nature: 'transfer', categoryId: null, transferAccountId: 'corretora' })
    const q = dialect.sqlToQuery(ops[0].where as SQL)
    expect(q.sql).toContain('"transactions"."org_id" = $1')
    expect(q.sql).toContain('"transactions"."counterparty_id" = $2')
    expect(q.sql).toContain('"transactions"."review_state" = $3')
    expect(q.sql).toContain('("transactions"."type" <> $4 or "transactions"."transfer_account_id" is null or "transactions"."transfer_account_id" <> $5)')
    expect(q.params).toEqual(['org-1', 'cp', 'confirmed', 'transfer', 'corretora'])
  })

  it('despesa: pega o que não é despesa nessa categoria', async () => {
    const { tx, ops } = fakeTx([[]])
    await selecionarLancamentosDaRegra(tx, 'org-1', regra, { nature: 'expense', categoryId: 'cat', transferAccountId: null })
    const q = dialect.sqlToQuery(ops[0].where as SQL)
    expect(q.sql).toContain('("transactions"."type" <> $4 or "transactions"."category_id" is null or "transactions"."category_id" <> $5)')
    expect(q.params).toEqual(['org-1', 'cp', 'confirmed', 'expense', 'cat'])
  })

  it('CPF próprio (transferência sem conta): segue a regra atual, para não desfazer o que foi decidido lançamento a lançamento', async () => {
    const { tx, ops } = fakeTx([[]])
    await selecionarLancamentosDaRegra(tx, 'org-1', { ...regra, transferAccountId: 'xp' }, { nature: 'transfer', categoryId: null, transferAccountId: null })
    const q = dialect.sqlToQuery(ops[0].where as SQL)
    expect(q.sql).toContain('"transactions"."type" = $4')
    expect(q.sql).toContain('"transactions"."transfer_account_id" = $5')
    expect(q.params).toEqual(['org-1', 'cp', 'confirmed', 'transfer', 'xp'])
  })
})
