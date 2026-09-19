import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and } from 'drizzle-orm'
import { buildBalanceScopeConditions } from '@/lib/finance/queries'

/**
 * Filtro nao muda saldo.
 *
 * O saldo da coluna era ancorado numa funcao de janela sobre o conjunto JA
 * FILTRADO — "soma das linhas que estou mostrando" em vez de "saldo naquela
 * data". Qualquer filtro que removesse linha movia a ancora:
 *
 *   sem filtro                  R$ 190.098,44
 *   so conta NU                 R$ 140.801,00  (certo por acidente)
 *   este mes (todas as contas)  R$  20.617,38  <- errado
 *   este mes + NU               R$     323,00  <- errado
 *
 * O filtro de conta acertava por coincidencia: somar todos os lancamentos de
 * uma conta da o saldo dela.
 *
 * A regra: a CONTA define de quem e o saldo, entao entra no escopo. Periodo,
 * categoria, tipo, busca e valor so escolhem o que aparece na tela, e nao
 * podem tocar no numero.
 */

const dialect = new PgDialect()
const sqlDe = (opts?: Parameters<typeof buildBalanceScopeConditions>[1]) =>
  dialect.sqlToQuery(and(...buildBalanceScopeConditions('org-1', opts))!).sql.toLowerCase()

describe('escopo do saldo acumulado', () => {
  it('sempre limita pela organizacao', () => {
    expect(sqlDe()).toContain('"org_id" =')
  })

  it('respeita o filtro de conta — o saldo e daquela conta', () => {
    expect(sqlDe({ accountId: 'conta-1' })).toContain('"account_id" =')
  })

  it('ignora o filtro de periodo', () => {
    const gerado = sqlDe({ startDate: '2026-09-01', endDate: '2026-09-30' })
    expect(gerado).not.toContain('"date"')
  })

  it('ignora busca, categoria, tipo e valor', () => {
    const gerado = sqlDe({
      search: 'mercado',
      categoryIds: 'cat-1',
      types: 'expense',
      minAmount: 100,
      maxAmount: 900,
    })
    expect(gerado).not.toContain('"description"')
    expect(gerado).not.toContain('"category_id"')
    expect(gerado).not.toContain('"type"')
    expect(gerado).not.toContain('abs(')
  })
})
