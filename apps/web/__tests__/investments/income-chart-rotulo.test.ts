import { describe, it, expect } from 'vitest'
import { rotuloDoMes } from '@/components/investments/income-chart'

// O eixo X da Renda Passiva mostrava a chave ISO ("2025-11").
describe('rótulo do mês na Renda Passiva', () => {
  it('mostra mês abreviado e ano, como a Evolução Patrimonial', () => {
    expect(rotuloDoMes('2025-11')).toBe('nov. de 25')
    expect(rotuloDoMes('2026-01')).toBe('jan. de 26')
  })
})
