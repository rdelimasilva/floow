import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and } from 'drizzle-orm'
import { buildTransactionConditions } from '@/lib/finance/queries'

/**
 * A listagem abre em hoje, nao em 2031.
 *
 * `generateInstallmentDates` materializa 60 MESES de lancamentos quando o
 * template e indefinido (recurring-batch.ts:42). Com 5 templates indefinidos,
 * a tabela tem 305 linhas de previsao, 263 delas no futuro, indo ate
 * 15/04/2031.
 *
 * Ordenada por data decrescente — o padrao — a lista abre com cinco paginas
 * de previsao antes do primeiro lancamento real da semana, e a coluna de
 * saldo mostra no topo a projecao de 2031: R$ 1.081.391,11.
 *
 * Com o corte em hoje, o topo passa a ser o saldo de hoje, R$ 164.536,11 —
 * que bate exatamente com a soma dos saldos das contas. A previsao futura
 * continua acessivel pelo filtro de periodo e pelo toggle.
 */

const dialect = new PgDialect()
const sqlDe = (opts?: Parameters<typeof buildTransactionConditions>[1]) =>
  dialect.sqlToQuery(and(...buildTransactionConditions('org-1', opts))!).sql.toLowerCase()

describe('recorte de data padrao da listagem', () => {
  it('sem opcao, corta em hoje', () => {
    expect(sqlDe()).toContain('"date" <=')
  })

  it('com includeFuture, nao corta', () => {
    expect(sqlDe({ includeFuture: true })).not.toContain('"date" <=')
  })

  it('filtro de data explicito manda, e o corte automatico sai do caminho', () => {
    const gerado = sqlDe({ startDate: '2031-01-01', endDate: '2031-12-31' })
    // Uma unica condicao de limite superior: a que o usuario pediu.
    expect(gerado.match(/"date" <=/g)?.length).toBe(1)
  })
})
