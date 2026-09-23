import { describe, it, expect } from 'vitest'
import {
  dataDeCalendario,
  formatarDataDeCalendario,
  redistribuirParcelas,
} from '@/lib/finance/recurring-dates'

/**
 * Coluna `date` chega do Postgres como meia-noite UTC. Lida com os getters
 * locais do navegador (UTC-3), virava o dia anterior: a tela mostrava 04/10
 * para uma parcela de 05/10, o campo de edição vinha com 04/10 e salvar
 * gravava 04/10 — cada edição puxava a data mais um dia para trás.
 */
describe('dataDeCalendario', () => {
  it('lê o dia em UTC, não no fuso do navegador', () => {
    expect(dataDeCalendario(new Date('2026-10-05T00:00:00.000Z'))).toBe('2026-10-05')
  })

  it('aceita a string ISO que atravessa a fronteira servidor/cliente', () => {
    expect(dataDeCalendario('2026-10-05T00:00:00.000Z')).toBe('2026-10-05')
    expect(dataDeCalendario('2026-10-05')).toBe('2026-10-05')
  })

  it('vazio vira vazio', () => {
    expect(dataDeCalendario(null)).toBe('')
    expect(dataDeCalendario(undefined)).toBe('')
  })
})

describe('formatarDataDeCalendario', () => {
  it('formata em pt-BR sem passar por Date', () => {
    expect(formatarDataDeCalendario('2026-10-05T00:00:00.000Z')).toBe('05/10/2026')
  })

  it('sem data mostra travessão', () => {
    expect(formatarDataDeCalendario(null)).toBe('—')
  })
})

describe('redistribuirParcelas', () => {
  it('a primeira parcela cai na data nova e as outras seguem a frequência', () => {
    expect(redistribuirParcelas('2026-10-10', 'monthly', 3)).toEqual([
      '2026-10-10',
      '2026-11-10',
      '2026-12-10',
    ])
  })

  it('respeita a frequência semanal', () => {
    expect(redistribuirParcelas('2026-10-10', 'weekly', 3)).toEqual([
      '2026-10-10',
      '2026-10-17',
      '2026-10-24',
    ])
  })

  it('fim de mês usa o mesmo corte da criação da recorrência', () => {
    expect(redistribuirParcelas('2027-01-31', 'monthly', 3)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-28',
    ])
  })

  it('nenhuma parcela, nenhuma data', () => {
    expect(redistribuirParcelas('2026-10-10', 'monthly', 0)).toEqual([])
  })
})
