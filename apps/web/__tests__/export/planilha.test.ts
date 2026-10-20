import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { planilhaDeTransacoes, planilhaDeFluxoDeCaixa } from '@/lib/export/planilha'

async function ler(buffer: Buffer) {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(buffer as never)
  return book.worksheets[0]
}

describe('planilhaDeTransacoes', () => {
  it('grava valor em reais como número e a data como data', async () => {
    const sheet = await ler(await planilhaDeTransacoes([
      { dia: '2026-10-05', descricao: 'Mercado', categoria: 'Alimentação', tipo: 'expense', amountCents: -12345 },
    ]))
    expect(sheet.getRow(1).values).toEqual([, 'Data', 'Descrição', 'Categoria', 'Tipo', 'Valor'])
    const linha = sheet.getRow(2)
    expect(linha.getCell(5).value).toBe(-123.45)
    const data = linha.getCell(1).value as Date
    expect(data.toISOString().slice(0, 10)).toBe('2026-10-05')
    expect(linha.getCell(4).value).toBe('Despesa')
  })

  it('aceita descrição e categoria vazias', async () => {
    const sheet = await ler(await planilhaDeTransacoes([
      { dia: '2026-10-05', descricao: null, categoria: null, tipo: 'income', amountCents: 100 },
    ]))
    expect(sheet.getRow(2).getCell(2).value).toBe('')
    expect(sheet.getRow(2).getCell(4).value).toBe('Receita')
  })
})

describe('planilhaDeFluxoDeCaixa', () => {
  it('junta realizado e previsto em ordem de mês', async () => {
    const sheet = await ler(await planilhaDeFluxoDeCaixa(
      [
        { month: '2026-10', income: 500000, expense: -300000, net: 200000 },
        { month: '2026-09', income: 400000, expense: -100000, net: 300000 },
      ],
      [
        { month: '2026-11', income: 0, expense: -50000, net: -50000 },
        { month: '2026-10', income: 0, expense: -20000, net: -20000 },
      ],
    ))
    const linhas = [2, 3, 4, 5].map((i) => [sheet.getRow(i).getCell(1).value, sheet.getRow(i).getCell(2).value])
    expect(linhas).toEqual([
      ['09/2026', 'Realizado'],
      ['10/2026', 'Realizado'],
      ['10/2026', 'Previsto'],
      ['11/2026', 'Previsto'],
    ])
    expect(sheet.getRow(3).getCell(5).value).toBe(2000)
  })
})
