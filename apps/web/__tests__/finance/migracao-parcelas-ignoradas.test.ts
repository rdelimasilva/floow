import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A 00054 tira do saldo a parcela que ficou no futuro. Linha ignorada com
 * `balance_applied = true` já teve o valor retirado pelo
 * `toggleIgnoreTransaction` — estornar de novo tiraria duas vezes. E se ela
 * virasse `balance_applied = false`, restaurar depois não devolveria nada.
 */
const SQL = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '00054_parcelas_do_cartao.sql'),
  'utf8',
).toLowerCase()

describe('migration 00054 e a parcela ignorada', () => {
  it('o estorno não conta a linha ignorada', () => {
    const estorno = SQL.slice(SQL.indexOf('estorno as ('), SQL.indexOf('group by t.account_id'))
    expect(estorno).toContain('and not t.is_ignored')
  })

  it('a linha ignorada mantém balance_applied, mas ganha a data corrigida', () => {
    const update = SQL.slice(SQL.indexOf('update public.transactions t'))
    expect(update).toMatch(/balance_applied = case\s+when t\.is_ignored then t\.balance_applied/)
    expect(update).toContain('purchase_date = t.date')
    expect(update).not.toMatch(/where[\s\S]*is_ignored/)
  })
})
