import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { transactions, ORIGENS_DE_TRANSACAO } from '@floow/db'

/**
 * `origem` é NOT NULL sem default de propósito: um caminho de entrada novo não
 * compila sem declarar de onde vem. O CHECK da migration e a lista do schema
 * têm de ser a mesma — divergir só estoura em produção, porque os testes
 * mockam o banco.
 *
 * A migration é dividida: 00070 (coluna nullable + backfill) é segura com o
 * código antigo em produção; 00071 (SET NOT NULL) só entra depois do deploy.
 */
const repoRoot = resolve(__dirname, '../../../..')
const ler = (nome: string) => readFileSync(resolve(repoRoot, 'supabase/migrations', nome), 'utf8').replace(/\r\n/g, '\n')
const migration = ler('00070_origem_e_aguarda_extrato.sql')
const notNull = ler('00071_origem_not_null.sql')
const coluna = (nome: string) => getTableConfig(transactions).columns.find((c) => c.name === nome)!

describe('origem da transação', () => {
  it('o CHECK da migration aceita exatamente as origens do schema', () => {
    const check = migration.match(/CHECK \(origem IN \(([\s\S]*?)\)\)/)?.[1] ?? ''
    const naMigration = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    expect(naMigration).toEqual([...ORIGENS_DE_TRANSACAO].sort())
  })

  it('origem é NOT NULL e sem default', () => {
    expect(coluna('origem').notNull).toBe(true)
    expect(coluna('origem').hasDefault).toBe(false)
  })

  it('aguarda_extrato é NOT NULL e nasce false', () => {
    expect(coluna('aguarda_extrato').notNull).toBe(true)
    expect(coluna('aguarda_extrato').default).toBe(false)
  })

  it('a 00070 pode rodar de novo sem erro nem efeito', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS origem/)
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS aguarda_extrato/)
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS idx_transactions_aguarda_extrato/)
    expect(migration).toMatch(/AND t\.origem IS NULL/)
  })

  it('a 00070 deixa origem nullable: o código antigo em produção ainda insere sem ela', () => {
    expect(migration).not.toMatch(/SET NOT NULL/)
  })

  it('a 00071 refaz o backfill só das linhas NULL e então aplica NOT NULL', () => {
    expect(notNull).toMatch(/AND t\.origem IS NULL/)
    expect(notNull).toMatch(/ALTER COLUMN origem SET NOT NULL/)
    expect(notNull.indexOf('t.origem IS NULL')).toBeLessThan(notNull.indexOf('SET NOT NULL'))
    expect(notNull).toMatch(/DEPOIS do deploy/)
  })

  it('as duas migrations usam a mesma regra de backfill', () => {
    const corpo = (sql: string) => sql.match(/SET origem = CASE[\s\S]*?END\n  FROM/)?.[0]
    expect(corpo(migration)).toBeDefined()
    expect(corpo(notNull)).toEqual(corpo(migration))
  })

  it('a 00071 refaz também a marca aguarda_extrato das pernas :transfer-par', () => {
    const marca = (sql: string) =>
      sql.match(/UPDATE public\.transactions\s+SET aguarda_extrato = true[\s\S]*?;/)?.[0]
    expect(marca(migration)).toBeDefined()
    expect(marca(notNull)).toEqual(marca(migration))
    expect(notNull.indexOf('SET aguarda_extrato = true')).toBeLessThan(notNull.indexOf('SET NOT NULL'))
  })

  it('ajuste de saldo não exige affects_cash_flow (ajustes antigos são anteriores a ele)', () => {
    expect(migration).toMatch(
      /t\.description LIKE 'Ajuste de saldo%' AND t\.external_id IS NULL AND t\.transfer_group_id IS NULL/,
    )
  })
})
