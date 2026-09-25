import { describe, it, expect } from 'vitest'
import { parseCSVFile, lerCabecalhoCsv } from '../import/csv'

/**
 * Extrato de banco brasileiro vem com ponto e vírgula e valor "1.234,56".
 * A tela separava o cabeçalho por vírgula (virava uma coluna só, e o
 * mapeamento automático errava), e o valor perdia os milhares: "1.234,56"
 * virava "1.234.56", lido como 1,234 — R$ 1,23.
 */
const CSV_PONTO_E_VIRGULA = `Data;Histórico;Valor
05/09/2026;Aluguel;-1.234,56
10/09/2026;Salário;R$ 8.500,00`

const MAPA = { dateColumn: 'Data', amountColumn: 'Valor', descriptionColumn: 'Histórico', dateFormat: 'dd/MM/yyyy' as const }

describe('CSV de banco brasileiro', () => {
  it('lê o cabeçalho separado por ponto e vírgula', () => {
    expect(lerCabecalhoCsv(CSV_PONTO_E_VIRGULA)).toEqual(['Data', 'Histórico', 'Valor'])
  })

  it('lê o cabeçalho separado por vírgula, com aspas', () => {
    expect(lerCabecalhoCsv('"Data","Descricao","Valor"\n01/01/2026,x,1')).toEqual(['Data', 'Descricao', 'Valor'])
  })

  it('valor com milhar e vírgula decimal', () => {
    const [aluguel] = parseCSVFile(CSV_PONTO_E_VIRGULA, MAPA)
    expect(aluguel.amountCents).toBe(-123456)
    expect(aluguel.type).toBe('expense')
  })

  it('valor com R$ na frente', () => {
    const [, salario] = parseCSVFile(CSV_PONTO_E_VIRGULA, MAPA)
    expect(salario.amountCents).toBe(850000)
  })
})
