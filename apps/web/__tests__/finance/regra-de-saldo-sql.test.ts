import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { sqlContaNoSaldo } from '@/lib/finance/balance-sql'

/**
 * A regra de "esta linha soma no saldo da listagem" existe em dois lugares
 * porque precisa: no cliente, para a coluna linha a linha
 * (`contaNoSaldoProjetado`), e no Postgres, para as somas de janela de onde
 * sai o `startingBalance` de cada pagina.
 *
 * Elas TEM que dizer a mesma coisa. Quando divergem o estrago e silencioso: o
 * saldo do topo da pagina sai de uma regra e os incrementos de outra, e a
 * coluna inteira fica errada sem nada quebrar. Foi o que aconteceu ao fazer a
 * previsao futura contar no cliente sem mexer no SQL.
 *
 * Este teste prende o lado SQL. O lado do cliente esta em
 * `saldo-projetado.test.ts`, e os dois descrevem os mesmos tres criterios.
 */

const dialect = new PgDialect()
const consulta = dialect.sqlToQuery(sqlContaNoSaldo('2026-09-19'))
const gerado = consulta.sql.toLowerCase()

describe('regra de saldo no SQL', () => {
  it('exclui conta de investimento', () => {
    // O tipo vai como parametro vinculado, nao literal no SQL — o drizzle
    // expande a lista em um `$n` por item.
    expect(gerado).toContain('"accounts"."type" not in')
    expect(consulta.params).toContain('brokerage')
  })

  it('inclui o que ja foi aplicado no saldo', () => {
    expect(gerado).toContain('"balance_applied"')
  })

  it('inclui previsao futura, pela data', () => {
    expect(gerado).toContain('"date"')
    expect(gerado).toContain('>')
  })

  it('exclui previsao ja casada com o realizado', () => {
    expect(gerado).toContain('"matched_transaction_id" is null')
  })
})
