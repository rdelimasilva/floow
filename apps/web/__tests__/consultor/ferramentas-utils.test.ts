import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { validar, intervaloDoMes, intervaloDeDatas, normalizar, mesSchema, dataISO } from '@/lib/consultor/ferramentas/utils'
import { ParametroInvalido } from '@/lib/consultor/ferramentas/tipos'

describe('utils das ferramentas', () => {
  it('intervaloDoMes cobre do dia 1 ao último dia, como a tela do plano', () => {
    const { inicio, fim } = intervaloDoMes('2026-02')
    expect(inicio).toEqual(new Date(2026, 1, 1))
    expect(fim).toEqual(new Date(2026, 2, 0))
  })

  it('mês fora do formato é parâmetro inválido', () => {
    expect(() => validar(z.object({ mes: mesSchema }), { mes: '2026-13' })).toThrow(ParametroInvalido)
    expect(() => validar(z.object({ mes: mesSchema }), { mes: 'setembro' })).toThrow(ParametroInvalido)
  })

  it('intervalo invertido é parâmetro inválido', () => {
    expect(() => intervaloDeDatas('2026-09-30', '2026-09-01')).toThrow(ParametroInvalido)
  })

  it('intervaloDeDatas usa data local, sem deslocar o dia', () => {
    const { inicio, fim } = intervaloDeDatas('2026-09-01', '2026-09-30')
    expect(inicio).toEqual(new Date(2026, 8, 1))
    expect(fim).toEqual(new Date(2026, 8, 30))
  })

  it('normalizar ignora acento e caixa', () => {
    expect(normalizar(' Alimentação ')).toBe('alimentacao')
    expect(normalizar('ALIMENTACAO')).toBe(normalizar('alimentação'))
  })

  it('dataISO aceita Date e string', () => {
    expect(dataISO(new Date(Date.UTC(2026, 8, 5)))).toBe('2026-09-05')
    expect(dataISO('2026-09-05')).toBe('2026-09-05')
  })
})
