import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and } from 'drizzle-orm'
import { condicoesDeParcelasPendentes } from '@/lib/finance/recurring-reschedule'

/**
 * Editar a data da recorrência move as parcelas que ainda estão em aberto.
 *
 * Antes a edição só mudava `recurring_templates.next_due_date` — que, com as
 * parcelas todas geradas na criação, é uma data depois da última. Nenhum
 * lançamento mudava de data e parecia que a edição não funcionava.
 *
 * O que se move é só o que ainda é previsão pura:
 *   - `balance_applied = false`: linha dentro de saldo tem data que o banco deu.
 *   - `matched_transaction_id IS NULL`: parcela casada é o registro de que o
 *     realizado cumpriu aquela data.
 *   - `is_ignored = false`: parcela marcada como ignorada fica onde está.
 *   - `date >= hoje`: o passado não se reescreve.
 */

const dialect = new PgDialect()
const HOJE = '2026-09-22'
const gerado = dialect
  .sqlToQuery(and(...condicoesDeParcelasPendentes('org-1', 'tpl-1', HOJE))!)
  .sql.toLowerCase()

describe('parcelas pendentes', () => {
  it('recorta por org e template', () => {
    expect(gerado).toContain('"org_id" =')
    expect(gerado).toContain('"recurring_template_id" =')
  })

  it('nunca toca em linha dentro de saldo, casada ou ignorada', () => {
    expect(gerado).toContain('"balance_applied" =')
    expect(gerado).toContain('"matched_transaction_id" is null')
    expect(gerado).toContain('"is_ignored" =')
  })

  it('só do dia de hoje em diante', () => {
    expect(gerado).toContain('"date" >=')
  })
})
