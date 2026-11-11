/**
 * Análises no recorte compartilhado: a visão que abre, a consulta sem corte de
 * 24 meses e o export que segue a tela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { visaoInicial } from '@/lib/finance/visao-do-fluxo'
import { resumoMensalDeLancamentos } from '@/lib/finance/resumo-mensal-de-lancamentos'

describe('visaoInicial', () => {
  it('período todo no futuro abre em Projetado', () => {
    expect(visaoInicial('realized', '2026-12-01', '2027-02-28', '2026-11-11')).toBe('projected')
  })
  it('período todo no passado com preferência Projetado abre em Realizado', () => {
    expect(visaoInicial('projected', '2026-01-01', '2026-03-31', '2026-11-11')).toBe('realized')
  })
  it('período que termina hoje, com preferência Projetado, abre em Realizado', () => {
    expect(visaoInicial('projected', '2025-11-01', '2026-11-11', '2026-11-11')).toBe('realized')
  })
  it('fora disso fica a preferência', () => {
    expect(visaoInicial('both', '2026-12-01', '2027-02-28', '2026-11-11')).toBe('both')
    expect(visaoInicial('realized', '2026-01-01', '2026-03-31', '2026-11-11')).toBe('realized')
    expect(visaoInicial('projected', '2026-11-01', '2026-11-30', '2026-11-11')).toBe('projected')
    expect(visaoInicial('realized', '', '', '2026-11-11')).toBe('realized')
  })
})

describe('resumoMensalDeLancamentos', () => {
  const t = (date: string, amountCents: number, type: string, accountId = 'a1') => ({ date: new Date(`${date}T00:00:00Z`), amountCents, type, accountId })
  const linhas = [
    t('2026-09-30', 10_00, 'income'),
    t('2026-10-01', 500_00, 'income'),
    t('2026-10-20', -200_00, 'expense'),
    t('2026-10-21', -50_00, 'expense', 'a2'),
    t('2026-10-22', -70_00, 'transfer'),
    t('2026-11-01', 5_00, 'income'),
  ]
  it('só o período, por mês, sem transferência', () => {
    expect(resumoMensalDeLancamentos(linhas, { inicio: '2026-10-01', fim: '2026-10-31' })).toEqual([
      { month: '2026-10', income: 500_00, expense: -250_00, net: 250_00 },
    ])
  })
  it('conta escolhida filtra', () => {
    expect(resumoMensalDeLancamentos(linhas, { inicio: '2026-10-01', fim: '2026-10-31', contas: ['a2'] })).toEqual([
      { month: '2026-10', income: 0, expense: -50_00, net: -50_00 },
    ])
  })
  it('ponta aberta não corta', () => {
    expect(resumoMensalDeLancamentos(linhas, {}).map((m) => m.month)).toEqual(['2026-11', '2026-10', '2026-09'])
  })
})

describe('getRecentTransactions com período', () => {
  const params: unknown[][] = []
  beforeEach(() => { params.length = 0 })

  it('com inicio em 2020 a consulta vai até 2020, não 24 meses', async () => {
    const { PgDialect } = await import('drizzle-orm/pg-core')
    const dialect = new PgDialect()
    vi.resetModules()
    vi.doMock('@floow/db', async (orig) => ({
      ...(await orig<typeof import('@floow/db')>()),
      getDb: () => ({
        select: () => {
          const where = (c: unknown) => { params.push(dialect.sqlToQuery(c as never).params); return { orderBy: () => Promise.resolve([]) } }
          return { from: () => ({ where, leftJoin: () => ({ where }) }) }
        },
      }),
    }))
    vi.doMock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve({}) }))
    vi.doMock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn, revalidateTag: vi.fn() }))
    const { getRecentTransactions } = await import('@/lib/finance/queries')
    await getRecentTransactions('org-1', { inicio: '2020-01-01', fim: '2020-12-31' })
    const datas = (params[0] ?? []).filter((p) => typeof p === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p)) as string[]
    expect(datas.some((d) => d.startsWith('2020-01-01'))).toBe(true)
    expect(datas.some((d) => d.startsWith('2020-12-31'))).toBe(true)
  }, 30_000)
})

describe('GET /api/cash-flow/export', () => {
  it('com startDate e endDate só traz o período', async () => {
    vi.resetModules()
    const planilha = vi.fn(async () => Buffer.from('x'))
    const recentes = vi.fn(async () => [
      { date: new Date('2026-09-30T00:00:00Z'), amountCents: 10_00, type: 'income', accountId: 'a1' },
      { date: new Date('2026-10-05T00:00:00Z'), amountCents: 500_00, type: 'income', accountId: 'a1' },
    ])
    vi.doMock('@/lib/finance/queries', () => ({
      getRecentTransactions: recentes,
      getFutureTransactions: vi.fn(async () => []),
    }))
    vi.doMock('@/lib/auth/session', () => ({ getVerifiedIdentity: async () => ({ userId: 'u' }), getOrgId: async () => 'org-1' }))
    vi.doMock('@/lib/audit/record', () => ({ recordAudit: vi.fn() }))
    vi.doMock('@/lib/export/planilha', () => ({ planilhaDeFluxoDeCaixa: planilha, TIPO_XLSX: 'x' }))
    const { GET } = await import('@/app/api/cash-flow/export/route')
    await GET(new Request('http://x/api/cash-flow/export?startDate=2026-10-01&endDate=2026-10-31'))
    expect(recentes).toHaveBeenCalledWith('org-1', { inicio: '2026-10-01', fim: '2026-10-31' })
    expect(planilha).toHaveBeenCalledWith([{ month: '2026-10', income: 500_00, expense: 0, net: 500_00 }], [])
  }, 30_000)
})
