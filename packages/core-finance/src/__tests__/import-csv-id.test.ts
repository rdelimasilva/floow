import { describe, it, expect } from 'vitest'
import { parseCSVFile } from '../import/csv'

/**
 * O id de cada linha era o base64 do JSON cortado em 24 caracteres — só os
 * 18 primeiros bytes, algo como `{"Data":"05/09/202`. Todas as linhas do mesmo
 * dia (e do mesmo dia em outro ano) ganhavam o mesmo id, e o índice único
 * descartava todas menos uma como "duplicadas".
 */
const MAPA = { dateColumn: 'Data', amountColumn: 'Valor', descriptionColumn: 'Histórico', dateFormat: 'dd/MM/yyyy' as const }

const ids = (csv: string) => parseCSVFile(csv, MAPA).map((t) => t.externalId)

describe('id das linhas do CSV', () => {
  it('linhas diferentes do mesmo dia têm ids diferentes', () => {
    const [a, b, c] = ids(`Data;Histórico;Valor
05/09/2026;Mercado;-10,00
05/09/2026;Farmácia;-20,00
05/09/2027;Aluguel;-30,00`)
    expect(new Set([a, b, c]).size).toBe(3)
  })

  it('duas compras idênticas no mesmo arquivo entram as duas', () => {
    const [a, b] = ids(`Data;Histórico;Valor
05/09/2026;Café;-8,00
05/09/2026;Café;-8,00`)
    expect(a).not.toBe(b)
  })

  it('o mesmo arquivo gera os mesmos ids — reimportar continua sendo duplicata', () => {
    const csv = `Data;Histórico;Valor
05/09/2026;Café;-8,00
05/09/2026;Café;-8,00
06/09/2026;Mercado;-50,00`
    expect(ids(csv)).toEqual(ids(csv))
  })
})
