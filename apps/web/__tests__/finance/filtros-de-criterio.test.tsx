import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { drizzle } from 'drizzle-orm/postgres-js'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and } from 'drizzle-orm'
import { buildTransactionConditions, consultaDaPagina } from '@/lib/finance/queries-transactions'
import { filtrosDaUrl } from '@/lib/finance/filtros-da-url'
import { FILTER_KEYS } from '@/lib/finance/filtros-lembrados'

const dialect = new PgDialect()
const sqlDe = (opts?: Parameters<typeof buildTransactionConditions>[1]) =>
  dialect.sqlToQuery(and(...buildTransactionConditions('org-1', opts))!).sql.toLowerCase()

let params = new URLSearchParams()
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
  usePathname: () => '/transactions',
}))
const { TransactionFilters } = await import('@/components/finance/transaction-filters')

describe('condições de critério', () => {
  it('caixa=1 exige confirmado, não ignorado e afeta o caixa', () => {
    const q = sqlDe(filtrosDaUrl({ caixa: '1', situacao: 'realizado' }))
    expect(q).toContain('"is_ignored" = $')
    expect(q).toContain('"review_state" = $')
    expect(q).toContain('coalesce("transactions"."affects_cash_flow", "categories"."affects_cash_flow", true)')
    expect(q).toContain('"balance_applied" = $')
  })

  it('sem os parâmetros, nada disso entra', () => {
    const q = sqlDe(filtrosDaUrl({}))
    expect(q).not.toContain('review_state')
    expect(q).not.toContain('affects_cash_flow')
    expect(q).not.toContain('balance_applied')
  })

  it('previsto: não corta em hoje e pede a previsão ainda por vencer', () => {
    const q = sqlDe(filtrosDaUrl({ situacao: 'previsto' }))
    expect(q).toContain('"balance_applied" = $')
    expect(q).toContain('forecast_match_proposals')
    expect(q).not.toMatch(/"date" <= \$\d+::date/)
  })

  it('realizado mantém o corte em hoje', () => {
    expect(sqlDe(filtrosDaUrl({ situacao: 'realizado' }))).toMatch(/"date" <= \$\d+::date/)
  })

  it('situacao inválida é ignorada', () => {
    expect(filtrosDaUrl({ situacao: 'xis' }).situacao).toBeUndefined()
  })

  it('a consulta da página junta categories, que o critério lê', () => {
    const gerado = consultaDaPagina(drizzle.mock(), 'org-1', { soAnalises: true }).toSQL().sql.toLowerCase()
    const pagina = gerado.slice(0, gerado.indexOf(') "pagina"'))
    expect(pagina).toContain('left join "categories"')
  })

  it('as duas chaves são lembradas', () => {
    expect(FILTER_KEYS).toEqual(expect.arrayContaining(['caixa', 'situacao']))
  })
})

describe('pílulas de critério', () => {
  it('aparecem ligadas, contam na gaveta e o clique desliga só a própria', () => {
    params = new URLSearchParams({ caixa: '1', situacao: 'previsto', search: 'x' })
    render(<TransactionFilters accounts={[]} />)
    expect(screen.getAllByText('Só o que entra nas análises').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Só previstos').length).toBeGreaterThan(0)
    expect(screen.queryByText('Só realizados')).toBeNull()
    expect(screen.getByRole('button', { name: /^Filtros/ }).textContent).toBe('Filtros3')
    fireEvent.click(screen.getAllByText('Só previstos')[0])
    const url = String(replace.mock.calls.at(-1)![0])
    expect(url).toContain('caixa=1')
    expect(url).not.toContain('situacao')
  })

  it('sem os parâmetros, nenhuma pílula', () => {
    params = new URLSearchParams()
    render(<TransactionFilters accounts={[]} />)
    expect(screen.queryByText(/Só /)).toBeNull()
  })
})
