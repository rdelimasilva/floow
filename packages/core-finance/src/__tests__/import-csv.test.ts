import { describe, it, expect } from 'vitest'
import { parseCSVFile } from '../import/csv'
import type { CsvColumnMapping } from '../import/csv'

// Sample CSV content for testing
const CSV_BR_FORMAT = `Data,Descricao,Valor
15/01/2024,Salario Janeiro,5000.00
20/01/2024,Supermercado Pague Menos,-150.75
25/01/2024,Farmacia Nissei,-89.90`

const CSV_ISO_FORMAT = `Date,Description,Amount
2024-01-15,January Salary,5000.00
2024-01-20,Grocery Store,-150.75`

const CSV_WITH_EMPTY_LINES = `Data,Descricao,Valor
15/01/2024,Salario Janeiro,5000.00

20/01/2024,Supermercado Pague Menos,-150.75

`

const BR_MAPPING: CsvColumnMapping = {
  dateColumn: 'Data',
  amountColumn: 'Valor',
  descriptionColumn: 'Descricao',
  dateFormat: 'dd/MM/yyyy',
}

const ISO_MAPPING: CsvColumnMapping = {
  dateColumn: 'Date',
  amountColumn: 'Amount',
  descriptionColumn: 'Description',
  dateFormat: 'yyyy-MM-dd',
}

describe('parseCSVFile', () => {
  it('returns array of NormalizedTransaction with column mapping', () => {
    const result = parseCSVFile(CSV_BR_FORMAT, BR_MAPPING)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(3)
  })

  it('parses dd/MM/yyyy date format correctly', () => {
    const result = parseCSVFile(CSV_BR_FORMAT, BR_MAPPING)
    const first = result[0]
    expect(first.date).toBeInstanceOf(Date)
    expect(first.date.getFullYear()).toBe(2024)
    expect(first.date.getMonth()).toBe(0) // January = 0
    expect(first.date.getDate()).toBe(15)
  })

  it('parses yyyy-MM-dd date format correctly', () => {
    const result = parseCSVFile(CSV_ISO_FORMAT, ISO_MAPPING)
    const first = result[0]
    expect(first.date).toBeInstanceOf(Date)
    expect(first.date.getFullYear()).toBe(2024)
    expect(first.date.getMonth()).toBe(0) // January = 0
    expect(first.date.getDate()).toBe(15)
  })

  it('sets type to expense and negative amountCents for negative amounts', () => {
    const result = parseCSVFile(CSV_BR_FORMAT, BR_MAPPING)
    const debit = result[1] // -150.75
    expect(debit.type).toBe('expense')
    expect(debit.amountCents).toBe(-15075)
  })

  it('sets type to income and positive amountCents for positive amounts', () => {
    const result = parseCSVFile(CSV_BR_FORMAT, BR_MAPPING)
    const credit = result[0] // 5000.00
    expect(credit.type).toBe('income')
    expect(credit.amountCents).toBe(500000)
  })

  it('skips empty lines', () => {
    const result = parseCSVFile(CSV_WITH_EMPTY_LINES, BR_MAPPING)
    expect(result.length).toBe(2)
  })

  it('generates deterministic externalId for deduplication', () => {
    const result1 = parseCSVFile(CSV_BR_FORMAT, BR_MAPPING)
    const result2 = parseCSVFile(CSV_BR_FORMAT, BR_MAPPING)
    expect(result1[0].externalId).toBe(result2[0].externalId)
    expect(result1[1].externalId).toBe(result2[1].externalId)
  })

  it('generates unique externalId for different rows', () => {
    const result = parseCSVFile(CSV_BR_FORMAT, BR_MAPPING)
    const ids = result.map((t) => t.externalId)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(result.length)
  })

  it('externalId starts with csv- prefix', () => {
    const result = parseCSVFile(CSV_BR_FORMAT, BR_MAPPING)
    result.forEach((t) => {
      expect(t.externalId).toMatch(/^csv-/)
    })
  })
})
