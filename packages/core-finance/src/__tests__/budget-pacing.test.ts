import { describe, it, expect } from 'vitest'
import { computeBudgetPacing } from '../budget-pacing'

/** Datas sempre em UTC ao meio-dia, para não haver deslocamento de fuso. */
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12, 0, 0))

describe('computeBudgetPacing', () => {
  it('devolve estrutura zerada para entrada vazia, sem lançar exceção', () => {
    const result = computeBudgetPacing({
      daily: [],
      budgets: [],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.plannedCents).toBe(0)
    expect(result.total.spentCents).toBe(0)
    expect(result.total.unbudgetedCents).toBe(0)
    expect(result.total.projectedCents).toBe(0)
    expect(result.total.daysInMonth).toBe(30)
    expect(result.byCategory).toEqual([])
    expect(result.series).toHaveLength(30)
  })

  it('acumula gasto por tipo de conta ao longo dos dias', () => {
    const result = computeBudgetPacing({
      daily: [
        { date: '2026-09-01', accountType: 'credit_card', categoryId: 'a', cents: 10000 },
        { date: '2026-09-03', accountType: 'credit_card', categoryId: 'a', cents: 5000 },
        { date: '2026-09-03', accountType: 'checking', categoryId: 'a', cents: 2000 },
      ],
      budgets: [],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    const d1 = result.series[0]
    const d2 = result.series[1]
    const d3 = result.series[2]

    expect(d1.byAccountTypeCum.credit_card).toBe(10000)
    // Dia sem transação mantém o acumulado do dia anterior.
    expect(d2.byAccountTypeCum.credit_card).toBe(10000)
    expect(d3.byAccountTypeCum.credit_card).toBe(15000)
    expect(d3.byAccountTypeCum.checking).toBe(2000)
    expect(d3.byAccountTypeCum.savings).toBe(0)
    // O último dia carrega o total do mês.
    expect(result.series[29].byAccountTypeCum.credit_card).toBe(15000)
  })

  it('ignora linhas cuja data cai fora do mês analisado', () => {
    const result = computeBudgetPacing({
      daily: [
        { date: '2026-08-31', accountType: 'checking', categoryId: 'a', cents: 99900 },
        { date: '2026-10-01', accountType: 'checking', categoryId: 'a', cents: 88800 },
        { date: '2026-09-05', accountType: 'checking', categoryId: 'a', cents: 1000 },
      ],
      budgets: [],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.series[29].byAccountTypeCum.checking).toBe(1000)
  })

  it('separa gasto orcado de nao orcado, incluindo transacao sem categoria', () => {
    const result = computeBudgetPacing({
      daily: [
        { date: '2026-09-02', accountType: 'checking', categoryId: 'alim', cents: 30000 },
        { date: '2026-09-02', accountType: 'checking', categoryId: 'saude', cents: 20000 },
        { date: '2026-09-02', accountType: 'cash', categoryId: null, cents: 5000 },
      ],
      budgets: [{ categoryId: 'alim', plannedCents: 100000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.plannedCents).toBe(100000)
    expect(result.total.spentCents).toBe(30000)
    // 'saude' nao tem teto e o gasto em dinheiro nao tem categoria.
    expect(result.total.unbudgetedCents).toBe(25000)
    expect(result.series[1].budgetedCum).toBe(30000)
    expect(result.series[1].unbudgetedCum).toBe(25000)
  })

  it('trata teto zero como categoria sem teto', () => {
    const result = computeBudgetPacing({
      daily: [{ date: '2026-09-02', accountType: 'checking', categoryId: 'lazer', cents: 7000 }],
      budgets: [{ categoryId: 'lazer', plannedCents: 0 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.plannedCents).toBe(0)
    expect(result.total.spentCents).toBe(0)
    expect(result.total.unbudgetedCents).toBe(7000)
    expect(result.byCategory).toEqual([])
  })

  const umPorDia = (dias: number, centsPorDia: number) =>
    Array.from({ length: dias }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      accountType: 'checking' as const,
      categoryId: 'alim',
      cents: centsPorDia,
    }))

  const noDia = (dia: number, categoryId: string, cents: number) => ({
    date: `2026-09-${String(dia).padStart(2, '0')}`,
    accountType: 'credit_card' as const,
    categoryId,
    cents,
  })

  it('projeta o fechamento pelo ritmo corrente no mes em andamento', () => {
    // 12 dias de setembro, R$ 100,00 por dia = 120000 acumulado.
    const result = computeBudgetPacing({
      daily: umPorDia(12, 10000),
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.daysElapsed).toBe(12)
    expect(result.total.spentCents).toBe(120000)
    // 120000 / 12 * 30 = 300000
    expect(result.total.projectedCents).toBe(300000)
    expect(result.total.confidence).toBe('normal')
  })

  it('marca confianca baixa antes do dia 7', () => {
    const result = computeBudgetPacing({
      daily: umPorDia(3, 10000),
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 3),
    })

    expect(result.total.daysElapsed).toBe(3)
    expect(result.total.confidence).toBe('low')
    expect(result.total.projectedCents).toBe(300000)
  })

  it('no dia 1 projeta sem dividir por zero', () => {
    const result = computeBudgetPacing({
      daily: umPorDia(1, 10000),
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 1),
    })

    expect(result.total.daysElapsed).toBe(1)
    expect(result.total.projectedCents).toBe(300000)
    expect(Number.isFinite(result.total.projectedCents)).toBe(true)
  })

  it('em mes encerrado a projecao iguala o realizado', () => {
    const result = computeBudgetPacing({
      daily: umPorDia(30, 10000),
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 10, 15),
    })

    expect(result.total.daysElapsed).toBe(30)
    expect(result.total.spentCents).toBe(300000)
    expect(result.total.projectedCents).toBe(300000)
    expect(result.total.confidence).toBe('final')
  })

  it('em mes futuro zera dias decorridos e projecao', () => {
    const result = computeBudgetPacing({
      daily: [],
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 12, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.daysElapsed).toBe(0)
    expect(result.total.projectedCents).toBe(0)
    expect(result.total.confidence).toBe('low')
    expect(result.total.daysInMonth).toBe(31)
  })

  it('conta 28 dias em fevereiro nao bissexto e 31 em janeiro', () => {
    const fev = computeBudgetPacing({
      daily: [], budgets: [], monthStart: utc(2026, 2, 1), today: utc(2026, 2, 10),
    })
    const jan = computeBudgetPacing({
      daily: [], budgets: [], monthStart: utc(2026, 1, 1), today: utc(2026, 1, 10),
    })

    expect(fev.total.daysInMonth).toBe(28)
    expect(fev.series).toHaveLength(28)
    expect(jan.total.daysInMonth).toBe(31)
  })

  it('classifica cada categoria e inclui as que nao tiveram gasto', () => {
    const result = computeBudgetPacing({
      daily: [
        // Realizado ja acima do teto -> estourado.
        noDia(5, 'lazer', 60000),
        // 120000 em 12 dias -> projeta 300000 contra teto 250000 = 120% -> risco.
        noDia(5, 'alim', 120000),
        // 40000 em 12 dias -> projeta 100000 contra teto 95000 = 105% -> atencao.
        noDia(5, 'transp', 40000),
      ],
      budgets: [
        { categoryId: 'lazer', plannedCents: 50000 },
        { categoryId: 'alim', plannedCents: 250000 },
        { categoryId: 'transp', plannedCents: 95000 },
        { categoryId: 'moradia', plannedCents: 200000 },
      ],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    const by = Object.fromEntries(result.byCategory.map((c) => [c.categoryId, c]))

    expect(by.lazer.status).toBe('estourado')
    expect(by.alim.status).toBe('risco')
    expect(by.alim.projectedCents).toBe(300000)
    expect(by.transp.status).toBe('atencao')
    // Categoria com teto e sem gasto continua na lista, como ok.
    expect(by.moradia.status).toBe('ok')
    expect(by.moradia.spentCents).toBe(0)
    expect(result.byCategory).toHaveLength(4)
  })

  it('estourado vence quando o gasto ja passou o teto, mesmo em mes encerrado', () => {
    // Gasto concentrado no dia 1 de um mes ja encerrado: projecao = realizado,
    // ambos acima do teto. Confirma que 'estourado' e avaliado (e vence) antes
    // de 'risco'/'atencao', não que a projeção fica abaixo do teto — isso só é
    // possível em mês futuro (daysElapsed === 0), coberto abaixo.
    const result = computeBudgetPacing({
      daily: [noDia(1, 'lazer', 51000)],
      budgets: [{ categoryId: 'lazer', plannedCents: 50000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 10, 5),
    })

    expect(result.byCategory[0].status).toBe('estourado')
  })

  it('respeita as fronteiras exatas de 100% e 110%', () => {
    // 10000 em 10 dias -> projeta 30000. Teto 30000 = exatamente 100% -> ok.
    const emCima = computeBudgetPacing({
      daily: [noDia(1, 'x', 10000)],
      budgets: [{ categoryId: 'x', plannedCents: 30000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 10),
    })
    expect(emCima.byCategory[0].projectedCents).toBe(30000)
    expect(emCima.byCategory[0].status).toBe('ok')

    // Mesma projecao contra teto 27273 -> 110,0% -> ainda atencao, nao risco.
    const noLimite = computeBudgetPacing({
      daily: [noDia(1, 'x', 10000)],
      budgets: [{ categoryId: 'x', plannedCents: 27273 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 10),
    })
    expect(noLimite.byCategory[0].status).toBe('atencao')
  })

  it('em mes futuro nenhuma categoria recebe alerta', () => {
    const result = computeBudgetPacing({
      daily: [],
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 12, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.byCategory[0].status).toBe('ok')
    expect(result.byCategory[0].projectedCents).toBe(0)
  })

  it('em mes futuro com parcela ja lancada, gasto conta zero e nenhum status de alerta', () => {
    // Parcela recorrente futura (balance_applied = false) de 300000, acima do
    // teto de 250000, lançada em 20/dez — dentro do mês analisado (dezembro),
    // que ainda não começou (hoje é 12/set). Antes da correção, spentCents
    // chegava a 300000 (soma de toda a série) e o status virava 'estourado'
    // num mês que ainda nem começou. Note: não usa o helper noDia() porque
    // ele fixa o mês em setembro; aqui a linha precisa cair em dezembro.
    const result = computeBudgetPacing({
      daily: [{ date: '2026-12-20', accountType: 'credit_card', categoryId: 'alim', cents: 300000 }],
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 12, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.spentCents).toBe(0)
    expect(result.total.daysElapsed).toBe(0)
    expect(result.byCategory[0].status).toBe('ok')
    expect(result.byCategory[0].spentCents).toBe(0)
    expect(result.byCategory[0].projectedCents).toBe(0)
  })

  it('exclui linha com data futura dentro do mes corrente do gasto e da projecao', () => {
    // Hoje é 5/set; uma parcela lançada para 20/set (30000) ainda não saiu da
    // conta. Antes da correção, spentCents somava a série inteira do mês
    // (30000 até o dia 20) e o projetado inflava para 30000/5*30 = 180000
    // contra um teto de 40000 — 'risco' sobre dinheiro que não saiu.
    const result = computeBudgetPacing({
      daily: [noDia(20, 'transp', 30000)],
      budgets: [{ categoryId: 'transp', plannedCents: 40000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 5),
    })

    expect(result.total.spentCents).toBe(0)
    expect(result.byCategory[0].spentCents).toBe(0)
    expect(result.byCategory[0].projectedCents).toBe(0)
    expect(result.byCategory[0].status).toBe('ok')
    // A linha continua presente na série (curva completa do mês para a UI).
    expect(result.series[19].budgetedCum).toBe(30000)
  })

  it('fronteira de fim de mes: ultimo dia e confidence normal, primeiro dia do mes seguinte e final', () => {
    const ultimoDia = computeBudgetPacing({
      daily: [],
      budgets: [],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 30),
    })

    expect(ultimoDia.total.daysElapsed).toBe(30)
    expect(ultimoDia.total.confidence).toBe('normal')

    const diaSeguinte = computeBudgetPacing({
      daily: [],
      budgets: [],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 10, 1),
    })

    expect(diaSeguinte.total.daysElapsed).toBe(30)
    expect(diaSeguinte.total.confidence).toBe('final')
  })
})
