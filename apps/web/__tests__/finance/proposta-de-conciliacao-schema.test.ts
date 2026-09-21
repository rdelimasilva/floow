import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { forecastMatchProposals } from '@floow/db'

/**
 * As três regras do gate moram em índice, não em código: o par recusado nunca
 * volta, uma proposta aberta por previsão, um realizado não é reivindicado por
 * duas previsões. Índice erra na frente do usuário; checagem em código erra em
 * silêncio quando dois cliques chegam juntos.
 */
const SQL = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '00047_forecast_match_proposals.sql'),
  'utf8',
).toLowerCase()

describe('tabela de propostas', () => {
  it('a tabela Drizzle tem as colunas que a fila usa', () => {
    const colunas = Object.keys(forecastMatchProposals)
    expect(colunas).toEqual(
      expect.arrayContaining([
        'id', 'orgId', 'forecastTransactionId', 'realizedTransactionId',
        'status', 'proposedAt', 'decidedAt',
      ]),
    )
  })
})

describe('migration 00047', () => {
  it('o par recusado nunca volta: único em (previsão, realizado)', () => {
    expect(SQL).toMatch(/unique index[\s\S]*\(forecast_transaction_id, realized_transaction_id\)/)
  })

  it('uma proposta aberta por previsão', () => {
    expect(SQL).toMatch(/unique index[\s\S]*\(forecast_transaction_id\)[\s\S]*where status = 'pending'/)
  })

  it('um realizado não é reivindicado por duas previsões', () => {
    expect(SQL).toMatch(/unique index[\s\S]*\(realized_transaction_id\)[\s\S]*where status = 'pending'/)
  })

  it('apagar qualquer ponta leva a proposta junto', () => {
    const cascades = SQL.match(/on delete cascade/g) ?? []
    expect(cascades.length).toBeGreaterThanOrEqual(3)
  })

  it('RLS ligada, com as quatro políticas por org', () => {
    expect(SQL).toContain('enable row level security')
    for (const acao of ['select', 'insert', 'update', 'delete']) {
      expect(SQL).toContain(`for ${acao} to authenticated`)
    }
    expect(SQL).toContain('public.get_user_org_ids()')
  })

  it('nao cria proposta retroativa para o que ja esta casado', () => {
    // O passado e fato consumado (spec §4). Um INSERT ... SELECT aqui poria a
    // org em mutirao no primeiro deploy.
    expect(SQL).not.toContain('insert into public.forecast_match_proposals')
  })
})
