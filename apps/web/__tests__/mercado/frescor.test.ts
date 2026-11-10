import { describe, it, expect } from 'vitest'
import { jobsParados } from '@/lib/mercado/frescor'

// Sexta-feira, 06/11/2026.
const agora = new Date('2026-11-06T13:00:00Z')
const dia = (d: string) => new Date(`${d}T09:00:00Z`)
const todosEmDia = { bcb: dia('2026-11-06'), cvm_cotas: dia('2026-11-06'), cvm_extrato: dia('2026-11-02'), tesouro: dia('2026-11-06'), b3: dia('2026-11-05') }

describe('jobsParados', () => {
  it('tudo em dia: nenhum parado', () => {
    expect(jobsParados(todosEmDia, agora)).toEqual([])
  })

  it('mais de 3 dias úteis sem ok: parado', () => {
    expect(jobsParados({ ...todosEmDia, bcb: dia('2026-11-02') }, agora)).toEqual(['bcb'])
  })

  it('3 dias úteis ainda não é parado', () => {
    expect(jobsParados({ ...todosEmDia, bcb: dia('2026-11-03') }, agora)).toEqual([])
  })

  it('fim de semana não conta como dia útil', () => {
    // Segunda 09/11: o último ok na quinta 05/11 está a 2 dias úteis.
    expect(jobsParados({ ...todosEmDia, bcb: dia('2026-11-05'), b3: dia('2026-11-06') }, new Date('2026-11-09T13:00:00Z'))).toEqual([])
  })

  it('extrato semanal tem 8 dias corridos', () => {
    expect(jobsParados({ ...todosEmDia, cvm_extrato: dia('2026-10-30') }, agora)).toEqual([])
    expect(jobsParados({ ...todosEmDia, cvm_extrato: dia('2026-10-28') }, agora)).toEqual(['cvm_extrato'])
  })

  it('job que nunca deu certo conta como parado', () => {
    expect(jobsParados({}, agora)).toEqual(['bcb', 'cvm_cotas', 'cvm_extrato', 'tesouro', 'b3'])
  })
})
