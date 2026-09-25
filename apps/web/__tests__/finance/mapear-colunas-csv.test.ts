import { describe, it, expect } from 'vitest'
import { mapeamentoAutomatico } from '@/lib/finance/mapear-colunas-csv'

describe('mapeamentoAutomatico', () => {
  it('reconhece colunas de extrato brasileiro', () => {
    expect(mapeamentoAutomatico(['Data', 'Histórico', 'Valor (em R$)'])).toEqual({
      dateColumn: 'Data',
      amountColumn: 'Valor (em R$)',
      descriptionColumn: 'Histórico',
      dateFormat: 'dd/MM/yyyy',
    })
  })

  it('reconhece colunas em inglês', () => {
    const m = mapeamentoAutomatico(['Date', 'Description', 'Amount'])
    expect([m.dateColumn, m.descriptionColumn, m.amountColumn]).toEqual(['Date', 'Description', 'Amount'])
  })
})
