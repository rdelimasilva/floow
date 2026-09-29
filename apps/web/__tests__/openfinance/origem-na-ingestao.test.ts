import { describe, it, expect } from 'vitest'
import { buildForecastTransferLegRow, buildTransferLegRow } from '@/lib/openfinance/transfer-leg'
import { linhaDaPrevisao } from '@/lib/openfinance/completar-parcelas'
import { camposDaOcupacao } from '@/lib/openfinance/parcelas-previstas'

const ORIGEM = {
  orgId: 'org-1',
  amountCents: -20000,
  date: new Date('2026-09-18T12:00:00Z'),
  externalId: '01a0b603-4d83-732c-a6d9-19833739b795',
  balanceApplied: true,
}

describe('origem declarada na ingestão Open Finance', () => {
  it('perna para conta manual é perna real: conta no saldo, não aguarda', () => {
    expect(buildTransferLegRow(ORIGEM, 'nubank', 'g-1')).toMatchObject({ origem: 'perna', aguardaExtrato: false, balanceApplied: true })
  })

  it('perna para conta Open Finance aguarda o extrato e fica fora do saldo', () => {
    expect(buildForecastTransferLegRow(ORIGEM, 'itau', 'nubank', 'g-1')).toMatchObject({
      origem: 'perna',
      aguardaExtrato: true,
      balanceApplied: false,
      externalId: `${ORIGEM.externalId}:transfer-par`,
    })
  })

  it('parcela prevista declara a própria origem', () => {
    const linha = linhaDaPrevisao(
      { purchaseDate: '2026-08-01', installmentNumber: 3, installmentTotal: 6, amountCents: -45916, date: '2026-11-16', description: 'AIRBNB', categoryId: null },
      { orgId: 'org-1', accountId: 'cartao' },
    )
    expect(linha.origem).toBe('parcela_prevista')
  })

  it('parcela real que ocupa a previsão passa a ser linha do extrato', () => {
    const c = camposDaOcupacao(
      { externalId: 'polp-3', amountCents: -45916, description: 'AIRBNB 03/06', date: '2026-10-16', categoryId: null },
      new Date('2026-10-20T15:00:00Z'),
    )
    expect(c.origem).toBe('extrato')
  })
})
