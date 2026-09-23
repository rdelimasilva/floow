import { describe, it, expect } from 'vitest'
import { paginaQueAbre, filtrosAteHoje } from '@/lib/finance/pagination'

/**
 * Com "Lançamentos futuros" ligado, a lista continua abrindo em hoje.
 *
 * A lista abre na última página porque, sem futuros, a última página é hoje.
 * Com futuros ligados a última página vira a parcela mais distante — e
 * recorrência sem fim gera até 60 meses à frente. A tela abria só com 2030 e
 * 2031, e parecia que o filtro tinha trocado todos os lançamentos por eles.
 *
 * Agora a abertura mira a página do último lançamento até hoje; os futuros
 * seguem logo depois, a um "Próxima"/"Última" de distância.
 */

describe('página em que a lista abre com futuros', () => {
  it('abre na página de hoje, não na da parcela mais distante', () => {
    // 95 lançamentos até hoje + 263 previsões → 12 páginas de 30; hoje está na 4ª
    expect(paginaQueAbre({ totalCount: 358, totalAteHoje: 95, pageSize: 30 })).toBe(4)
  })

  it('sem nada até hoje (período todo no futuro), abre na primeira', () => {
    expect(paginaQueAbre({ totalCount: 40, totalAteHoje: 0, pageSize: 30 })).toBe(1)
  })

  it('page na URL continua mandando', () => {
    expect(paginaQueAbre({ pageParam: '12', totalCount: 358, totalAteHoje: 95, pageSize: 30 })).toBe(12)
  })

  it('em outra ordenação continua abrindo na primeira', () => {
    expect(paginaQueAbre({ totalCount: 358, totalAteHoje: 95, pageSize: 30, sortDir: 'desc' })).toBe(1)
  })

  it('sem futuros, nada muda: última página', () => {
    expect(paginaQueAbre({ totalCount: 95, pageSize: 30 })).toBe(4)
  })
})

describe('filtros da contagem até hoje', () => {
  const hoje = '2026-09-23'

  it('desliga os futuros e mantém os outros filtros', () => {
    const f = filtrosAteHoje({ accountId: 'a1', search: 'x', includeFuture: true }, hoje)
    expect(f).toEqual({ accountId: 'a1', search: 'x', includeFuture: false, endDate: hoje })
  })

  it('data final no futuro é cortada em hoje', () => {
    expect(filtrosAteHoje({ endDate: '2031-04-15', includeFuture: true }, hoje).endDate).toBe(hoje)
  })

  it('data final no passado fica como está', () => {
    expect(filtrosAteHoje({ endDate: '2026-05-31', includeFuture: true }, hoje).endDate).toBe('2026-05-31')
  })
})
