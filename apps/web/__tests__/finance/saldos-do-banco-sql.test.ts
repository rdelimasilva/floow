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
    expect(sql).toMatch(/t\.ocorrido_em\s*>\s*"openfinance_resources"\."bank_balance_at"/)
  })
})
