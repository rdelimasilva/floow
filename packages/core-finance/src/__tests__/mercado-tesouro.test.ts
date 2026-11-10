import { describe, it, expect } from 'vitest'
import { parseTesouro } from '../mercado/tesouro'

const CAB = 'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha'
const L1 = 'Tesouro Selic;01/03/2029;05/11/2026;0,06;0,07;20216,19;20201,19;20201,19'
const L0 = 'Tesouro Selic;01/03/2029;04/11/2026;0,06;0,07;20210,00;20200,00;20200,00'

describe('parseTesouro', () => {
  it('lê taxa e PU com vírgula decimal', () => {
    const r = parseTesouro([CAB, L1].join('\n'), null)
    expect(r).toEqual({
      invalidas: 0,
      linhas: [{ tipo: 'Tesouro Selic', vencimento: '2029-03-01', data: '2026-11-05', taxaCompra: 0.06, taxaVenda: 0.07, puCompra: 20216.19, puVenda: 20201.19 }],
    })
  })

  it('só traz o que é posterior à última data gravada', () => {
    expect(parseTesouro([CAB, L0, L1].join('\n'), '2026-11-04').linhas.map((l) => l.data)).toEqual(['2026-11-05'])
    expect(parseTesouro([CAB, L1].join('\n'), '2026-11-05').linhas).toEqual([])
  })

  it('taxa vazia fica null', () => {
    expect(parseTesouro([CAB, L1.replace(';0,06;', ';;')].join('\n'), null).linhas[0].taxaCompra).toBeNull()
  })

  it('data quebrada conta como inválida', () => {
    expect(parseTesouro([CAB, L1.replace('05/11/2026', '5/11/26')].join('\n'), null)).toEqual({ linhas: [], invalidas: 1 })
  })
})
