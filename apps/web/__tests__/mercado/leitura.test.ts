import { describe, it, expect } from 'vitest'
import { acumular } from '@floow/core-finance'
import { acumuladoNoPeriodo, retornoPorPreco, daMesmaSubclasse } from '@/lib/mercado/leitura'

describe('acumuladoNoPeriodo', () => {
  const cdi = [
    { data: '2026-11-03', valor: 0.05 },
    { data: '2026-11-04', valor: 0.05 },
    { data: '2026-11-05', valor: 0.05 },
  ]

  it('compõe as taxas depois de "de" até "ate"', () => {
    expect(acumuladoNoPeriodo(cdi, '2026-11-02', '2026-11-05', 5)).toBeCloseTo(acumular([0.05, 0.05, 0.05]), 12)
    expect(acumuladoNoPeriodo(cdi, '2026-11-03', '2026-11-05', 5)).toBeCloseTo(acumular([0.05, 0.05]), 12)
  })

  it('período que começa antes do primeiro dado gravado é null', () => {
    expect(acumuladoNoPeriodo(cdi, '2026-10-01', '2026-11-05', 5)).toBeNull()
  })

  it('período que termina muito depois do último dado é null', () => {
    expect(acumuladoNoPeriodo(cdi, '2026-11-02', '2026-11-30', 5)).toBeNull()
  })

  it('sem dado nenhum é null, não zero', () => {
    expect(acumuladoNoPeriodo([], '2026-11-02', '2026-11-05', 5)).toBeNull()
  })
})

describe('retornoPorPreco', () => {
  const cotas = [
    { data: '2025-11-05', preco: 100 },
    { data: '2026-06-01', preco: 105 },
    { data: '2026-11-05', preco: 110 },
  ]

  it('preço da última data até "ate" sobre o da última até "de"', () => {
    expect(retornoPorPreco(cotas, '2025-11-05', '2026-11-05')).toBeCloseTo(0.1, 12)
    expect(retornoPorPreco(cotas, '2025-11-07', '2026-11-06')).toBeCloseTo(0.1, 12)
  })

  it('sem preço até "de" é null', () => {
    expect(retornoPorPreco(cotas, '2025-11-01', '2026-11-05')).toBeNull()
  })

  it('preço velho demais no fim do período é null', () => {
    expect(retornoPorPreco(cotas, '2025-11-05', '2026-12-31')).toBeNull()
  })
})

describe('frescor', () => {
  it('data do último ok de cada job', async () => {
    const { frescor } = await import('@/lib/mercado/leitura')
    const { repoMemoria } = await import('./repo-memoria')
    const { repo } = repoMemoria()
    await repo.registrarExecucao({ job: 'bcb', inicio: new Date('2026-11-05T09:00:00Z'), fim: new Date('2026-11-05T09:00:05Z'), ok: true, linhas: 6, erro: null })
    await repo.registrarExecucao({ job: 'bcb', inicio: new Date('2026-11-06T09:00:00Z'), fim: new Date('2026-11-06T09:00:05Z'), ok: false, linhas: 0, erro: 'x' })
    expect(await frescor(repo)).toEqual({ bcb: '2026-11-05' })
  })
})

describe('daMesmaSubclasse', () => {
  it('fica só com as cotas da subclasse da cota mais recente', () => {
    const linhas = [
      { data: '2026-01-02', preco: 1.0, subclasse: 'A' },
      { data: '2026-01-05', preco: 0.7, subclasse: 'B' },
      { data: '2026-06-01', preco: 1.1, subclasse: 'A' },
    ]
    expect(daMesmaSubclasse(linhas).map((l) => l.preco)).toEqual([1.0, 1.1])
  })

  it('lista vazia continua vazia', () => {
    expect(daMesmaSubclasse([])).toEqual([])
  })
})
