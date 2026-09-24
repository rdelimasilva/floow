import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  SUFIXO_PERNA_PREVISTA,
  ehPernaPrevista,
  condicaoDePernaPrevista,
  condicaoNaoEPernaPrevista,
} from '@/lib/openfinance/perna-prevista'

const dialect = new PgDialect()

describe('perna prevista de transferência', () => {
  it('reconhece pelo sufixo do external_id', () => {
    expect(ehPernaPrevista(`abc${SUFIXO_PERNA_PREVISTA}`)).toBe(true)
    expect(ehPernaPrevista('abc:transfer-dest')).toBe(false)
    expect(ehPernaPrevista(null)).toBe(false)
  })

  it('condição positiva filtra por LIKE no sufixo', () => {
    const q = dialect.sqlToQuery(condicaoDePernaPrevista())
    expect(q.sql).toContain('"external_id" like')
    expect(q.params).toContain(`%${SUFIXO_PERNA_PREVISTA}`)
  })

  it('condição negativa deixa passar external_id nulo', () => {
    const q = dialect.sqlToQuery(condicaoNaoEPernaPrevista())
    expect(q.sql).toContain('"external_id" is null')
    expect(q.sql).toContain('not like')
    expect(q.params).toContain(`%${SUFIXO_PERNA_PREVISTA}`)
  })
})
