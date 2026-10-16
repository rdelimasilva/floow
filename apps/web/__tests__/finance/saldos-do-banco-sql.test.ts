import { describe, it, expect } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import { consultaSaldosDoBanco } from '@/lib/finance/queries-accounts'

describe('consultaSaldosDoBanco', () => {
  // Numa consulta de tabela só o Drizzle tira o nome da tabela das colunas do
  // select. O subselect virava `"account_id" = "account_id"` e somava o extrato
  // de todas as contas: o salário do Itaú saía também do saldo do Nubank.
  it('o extrato que chegou depois é só o da própria conta', () => {
    const db = drizzle.mock()
    const { sql } = consultaSaldosDoBanco(db as never, 'org-1').toSQL()

    expect(sql).not.toMatch(/"account_id"\s*=\s*"account_id"/)
    expect(sql).toMatch(/t\.account_id\s*=\s*"openfinance_resources"\."account_id"/)
  })

  // O banco grava a apuração cortada no segundo, e ela é o instante do último
  // lançamento: o salário das 13:37:24.080 contra a apuração das 13:37:24 já
  // estava no saldo, mas comparado com os milésimos ficava "depois".
  it('compara com a apuração no segundo, sem os milésimos', () => {
    const { sql } = consultaSaldosDoBanco(drizzle.mock() as never, 'org-1').toSQL()

    expect(sql).toMatch(/date_trunc\('second', t\.ocorrido_em\)\s*>\s*"openfinance_resources"\."bank_balance_at"/)
  })
})
