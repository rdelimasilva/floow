import { describe, it, expect } from 'vitest'
import { mediaMensalPorCategoria, planejarAplicacao } from '@/lib/finance/simulador-orcamento'

describe('mediaMensalPorCategoria', () => {
  it('divide pelo total de meses da janela, contando mês sem gasto como zero', () => {
    const rows = [
      { categoryId: 'mercado', month: '2026-07', cents: 60_000 },
      { categoryId: 'mercado', month: '2026-08', cents: 30_000 },
      { categoryId: 'viagem', month: '2026-08', cents: 90_000 },
    ]
    const media = mediaMensalPorCategoria(rows, ['2026-07', '2026-08', '2026-09'])
    expect(media).toEqual([
      { categoryId: 'mercado', spent: 30_000 },
      { categoryId: 'viagem', spent: 30_000 },
    ])
  })

  it('sem meses fechados não há média', () => {
    expect(mediaMensalPorCategoria([{ categoryId: 'x', cents: 100 }], [])).toEqual([])
  })
})

describe('planejarAplicacao', () => {
  const mes = '2026-01-01'
  const antiga = { id: 'e1', startMonth: '2025-06-01', endMonth: null }

  it('ignora linha que não mudou', () => {
    expect(planejarAplicacao([{ categoryId: 'c', simuladoCents: 500, vigenteCents: 500, entrada: antiga }], mes)).toEqual([])
  })

  it('meta que começou antes é encerrada no mês anterior e ganha sucessora, sem mexer no passado', () => {
    const ops = planejarAplicacao(
      [{ categoryId: 'c', simuladoCents: 800, vigenteCents: 500, entrada: { ...antiga, endMonth: '2026-12-01' } }],
      mes,
    )
    expect(ops).toEqual([
      { tipo: 'encerrar', id: 'e1', endMonth: '2025-12-01' },
      { tipo: 'criar', categoryId: 'c', plannedCents: 800, startMonth: mes, endMonth: '2026-12-01' },
    ])
  })

  it('meta que começa no próprio mês é atualizada ou apagada', () => {
    const doMes = { id: 'e2', startMonth: mes, endMonth: null }
    expect(planejarAplicacao([{ categoryId: 'c', simuladoCents: 300, vigenteCents: 500, entrada: doMes }], mes)).toEqual([
      { tipo: 'atualizar', id: 'e2', plannedCents: 300 },
    ])
    expect(planejarAplicacao([{ categoryId: 'c', simuladoCents: 0, vigenteCents: 500, entrada: doMes }], mes)).toEqual([
      { tipo: 'apagar', id: 'e2' },
    ])
  })

  it('zerar meta antiga só encerra', () => {
    expect(planejarAplicacao([{ categoryId: 'c', simuladoCents: 0, vigenteCents: 500, entrada: antiga }], mes)).toEqual([
      { tipo: 'encerrar', id: 'e1', endMonth: '2025-12-01' },
    ])
  })

  it('categoria nova vira meta a partir do mês; zerar linha só de recorrentes não grava nada', () => {
    expect(planejarAplicacao([{ categoryId: 'n', simuladoCents: 200, vigenteCents: 0, entrada: null }], mes)).toEqual([
      { tipo: 'criar', categoryId: 'n', plannedCents: 200, startMonth: mes, endMonth: null },
    ])
    expect(planejarAplicacao([{ categoryId: 'r', simuladoCents: 0, vigenteCents: 400, entrada: null }], mes)).toEqual([])
  })
})
