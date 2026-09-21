import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and } from 'drizzle-orm'
import {
  condicoesDeParcelasFuturas,
  condicoesDeParcelasVencidasNaoConciliadas,
} from '@/lib/finance/recurring-cleanup'

/**
 * Cancelar a recorrência pode levar as vencidas não conciliadas também.
 *
 * `cancelRecurring` apagava só `date > hoje`. As parcelas cuja data passou e
 * que o banco nunca confirmou ficavam para trás para sempre: não entram em
 * `accounts.balance_cents`, saem do saldo projetado, e sobrava apagar uma a
 * uma. Com o template já desativado, nem "cancelar recorrência" as alcançava.
 *
 * O recorte da limpeza é estreito de propósito, porque apagar lançamento é
 * irreversível:
 *
 *   - `balance_applied = false` — nunca tocar em linha que está dentro de um
 *     saldo, senão apagar exigiria reverter dinheiro e a limpeza deixaria o
 *     saldo da conta errado.
 *   - `matched_transaction_id IS NULL` — a previsão já casada é o registro de
 *     que o realizado cumpriu aquela parcela; não é lixo.
 *   - `date <= hoje` — o futuro é o outro corte, que sai de qualquer jeito.
 */

const dialect = new PgDialect()
const sqlDe = (cond: ReturnType<typeof condicoesDeParcelasFuturas>) =>
  dialect.sqlToQuery(and(...cond)!).sql.toLowerCase()

const HOJE = '2026-09-21'

describe('parcelas futuras', () => {
  it('recorta por template, org e data futura', () => {
    const gerado = sqlDe(condicoesDeParcelasFuturas('org-1', 'tpl-1', HOJE))

    expect(gerado).toContain('"recurring_template_id" =')
    expect(gerado).toContain('"org_id" =')
    expect(gerado).toContain('"date" >')
  })

  it('não olha conciliação: parcela futura sai de qualquer jeito', () => {
    const gerado = sqlDe(condicoesDeParcelasFuturas('org-1', 'tpl-1', HOJE))

    expect(gerado).not.toContain('matched_transaction_id')
  })
})

describe('parcelas vencidas não conciliadas', () => {
  const gerado = sqlDe(condicoesDeParcelasVencidasNaoConciliadas('org-1', 'tpl-1', HOJE))

  it('pega só o que já venceu', () => {
    expect(gerado).toContain('"date" <=')
    expect(gerado).not.toContain('"date" >')
  })

  it('nunca toca em linha que está dentro de um saldo', () => {
    expect(gerado).toContain('"balance_applied" =')
    expect(gerado).toContain('$3')
  })

  it('poupa a previsão já casada com o realizado', () => {
    expect(gerado).toContain('"matched_transaction_id" is null')
  })

  it('segue presa ao template e à org', () => {
    expect(gerado).toContain('"recurring_template_id" =')
    expect(gerado).toContain('"org_id" =')
  })
})
