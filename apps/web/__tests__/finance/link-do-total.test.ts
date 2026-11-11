import { describe, it, expect, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and } from 'drizzle-orm'
import { idsComFilhas, limitesDoGrupo, periodoDaCelula, limitesDoMes, linkDeCelulaDoFluxo, linkDeGastoDoMes, linkDoTotal } from '@/lib/finance/link-do-total'
import { FILTER_KEYS } from '@/lib/finance/filtros-lembrados'
import { filtrosDaUrl } from '@/lib/finance/filtros-da-url'
import { buildTransactionConditions } from '@/lib/finance/queries-transactions'
import { situacaoDaUrl } from '@/lib/finance/filtros-da-url'

const dbFalso = vi.hoisted(() => ({ where: null as unknown }))
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }))
vi.mock('@floow/db', async (orig) => ({
  ...(await orig<object>()),
  getDb: () => {
    const cadeia: Record<string, unknown> = {}
    for (const m of ['select', 'from', 'leftJoin', 'groupBy']) cadeia[m] = () => cadeia
    cadeia.where = (w: unknown) => { dbFalso.where = w; return cadeia }
    cadeia.then = (r: (v: unknown[]) => void) => r([])
    return cadeia
  },
}))

const dialect = new PgDialect()
const clausulas = (sqlTexto: string) =>
  sqlTexto.toLowerCase().replace(/\$\d+/g, '$').replace(/ in \(\$\)/g, ' = $').replace(/^\(|\)$/g, '').split(' and ')

describe('linkDoTotal', () => {
  it('leva as chaves na ordem de FILTER_KEYS, sempre com início e fim', () => {
    const url = linkDoTotal({
      inicio: '2026-10-01', fim: '2026-10-31', categoryIds: ['a', 'b'], accountIds: ['c1'],
      tipos: ['expense'], caixa: true, situacao: 'realizado',
    })
    const chaves = [...new URL(url, 'http://x').searchParams.keys()]
    expect(chaves).toEqual(['accountId', 'startDate', 'endDate', 'types', 'categoryIds', 'caixa', 'situacao'])
    const posicoes = chaves.map((k) => (FILTER_KEYS as readonly string[]).indexOf(k))
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b))
    expect(url.startsWith('/transactions?')).toBe(true)
  })

  it('omite o que não foi pedido', () => {
    expect(linkDoTotal({ inicio: '2026-10-01', fim: '2026-10-31' })).toBe(
      '/transactions?startDate=2026-10-01&endDate=2026-10-31',
    )
  })

  it('limites do mês, inclusive fevereiro bissexto', () => {
    expect(limitesDoMes('2026-10-01')).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' })
    expect(limitesDoMes('2028-02')).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' })
  })
})

describe('idsComFilhas', () => {
  const cats = [
    { id: 'pai', parentId: null },
    { id: 'f1', parentId: 'pai' },
    { id: 'f2', parentId: 'pai' },
    { id: 'neta', parentId: 'f1' },
    { id: 'outra', parentId: null },
  ]
  it('sem metas, leva todas as descendentes', () => {
    expect(idsComFilhas('pai', cats).sort()).toEqual(['f1', 'f2', 'neta', 'pai'])
  })
  it('folha leva só a si', () => {
    expect(idsComFilhas('outra', cats)).toEqual(['outra'])
  })
  it('filha com meta própria sai da pai, com a descendente dela', () => {
    expect(idsComFilhas('pai', cats, ['pai', 'f1']).sort()).toEqual(['f2', 'pai'])
    expect(idsComFilhas('f1', cats, ['pai', 'f1']).sort()).toEqual(['f1', 'neta'])
  })
  it('ciclo não trava', () => {
    expect(idsComFilhas('a', [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }], ['a']).sort()).toEqual(['a', 'b'])
  })
})

describe('soma: a lista de Transações usa os mesmos critérios de getSpendingByCategory', () => {
  // Sem motor SQL no teste (o banco é mockado), compara os critérios das duas
  // consultas. Estorno, ignorado, previsão conciliada e aplicação fora do caixa
  // só ficam de fora das duas se as cláusulas coincidirem; o que é só da lista
  // (org, categoria, datas, matched) é tirado da comparação.
  it('mesmas cláusulas de critério', async () => {
    const { getSpendingByCategory } = await import('@/lib/finance/budget-queries')
    await getSpendingByCategory('org-1', new Date('2026-10-01'), new Date('2026-10-31'))
    const gasto = clausulas(dialect.sqlToQuery(dbFalso.where as never).sql)

    const url = new URL(linkDeGastoDoMes('2026-10-01', ['c1']), 'http://x').searchParams
    const params = Object.fromEntries(url.entries())
    const lista = clausulas(dialect.sqlToQuery(and(...buildTransactionConditions('org-1', filtrosDaUrl(params)))!).sql)

    const soDaConsulta = (c: string) => /org_id|"date"|category_id|matched_transaction_id/.test(c)
    const criterios = gasto.filter((c) => !soDaConsulta(c))
    expect(criterios.length).toBe(5) // type, review_state, is_ignored, balance_applied, affects_cash_flow
    for (const c of criterios) expect(lista).toContain(c)
    // Outro sentido: a lista não pode ter filtro a mais, que esconderia linhas do total.
    for (const c of lista.filter((c) => !soDaConsulta(c))) expect(gasto).toContain(c)
  })

  it('o link nunca perde o fim do mês', () => {
    const p = new URL(linkDeGastoDoMes('2026-10-01', ['c1']), 'http://x').searchParams
    expect(p.get('endDate')).toBe('2026-10-31')
  })
})

describe('linkDeCelulaDoFluxo', () => {
  const base = { inicio: '2026-10-01', fim: '2026-10-31', tipo: 'expense' as const, ocultarTransferencias: true }
  const sit = (visao: 'realized' | 'projected' | 'both') =>
    new URL(linkDeCelulaDoFluxo({ ...base, visao })!, 'http://x').searchParams.get('situacao')

  it('situacao segue a visão (Ambos = ambos)', () => {
    expect(sit('realized')).toBe('realizado')
    expect(sit('projected')).toBe('previsto')
    expect(sit('both')).toBe('ambos')
  })
  it('mantém caixa, tipo e período', () => {
    const p = new URL(linkDeCelulaDoFluxo({ ...base, visao: 'both' })!, 'http://x').searchParams
    expect([p.get('caixa'), p.get('types'), p.get('startDate'), p.get('endDate')]).toEqual(['1', 'expense', '2026-10-01', '2026-10-31'])
  })
  it('sem link com transferências à mostra', () => {
    expect(linkDeCelulaDoFluxo({ ...base, visao: 'realized', ocultarTransferencias: false })).toBeNull()
  })
})

describe('situacao=ambos', () => {
  const sqlDe = (params: Record<string, string>) =>
    dialect.sqlToQuery(and(...buildTransactionConditions('org-1', filtrosDaUrl(params)))!).sql.toLowerCase()

  it('a URL aceita ambos', () => {
    expect(situacaoDaUrl('ambos')).toBe('ambos')
    expect(situacaoDaUrl('xis')).toBeUndefined()
  })
  it('gera realizado OU previsão por vencer', () => {
    const q = sqlDe({ situacao: 'ambos' })
    expect(q).toMatch(/"balance_applied" = \$\d+ or \("transactions"\."balance_applied" = \$\d+ and/)
    expect(q).toContain('forecast_match_proposals')
  })
  it('sem endDate não corta em hoje', () => {
    expect(sqlDe({ situacao: 'ambos' })).not.toMatch(/"date" <= \$\d+::date/)
    expect(sqlDe({ situacao: 'realizado' })).toMatch(/"date" <= \$\d+::date/)
  })
})

describe('período da célula', () => {
  const tela = { startDate: '', endDate: '' }
  it('trimestre e semestre', () => {
    expect(limitesDoGrupo('2026-Q4', 'quarterly')).toEqual({ inicio: '2026-10-01', fim: '2026-12-31' })
    expect(limitesDoGrupo('2026-Q1', 'quarterly')).toEqual({ inicio: '2026-01-01', fim: '2026-03-31' })
    expect(limitesDoGrupo('2026-S1', 'semiannual')).toEqual({ inicio: '2026-01-01', fim: '2026-06-30' })
    expect(limitesDoGrupo('2026-S2', 'semiannual')).toEqual({ inicio: '2026-07-01', fim: '2026-12-31' })
    expect(limitesDoGrupo('2026', 'annual')).toEqual({ inicio: '2026-01-01', fim: '2026-12-31' })
    expect(limitesDoGrupo('2026-10-05', 'daily')).toEqual({ inicio: '2026-10-05', fim: '2026-10-05' })
  })
  it('corta pelo período da tela', () => {
    expect(periodoDaCelula('2026-Q4', 'quarterly', { startDate: '2026-11-10', endDate: '2026-11-20' }))
      .toEqual({ inicio: '2026-11-10', fim: '2026-11-20' })
    expect(periodoDaCelula('2026-Q4', 'quarterly', tela)).toEqual({ inicio: '2026-10-01', fim: '2026-12-31' })
    expect(periodoDaCelula('2026-10', 'monthly', { startDate: '2026-01-01', endDate: '2026-12-31' }))
      .toEqual({ inicio: '2026-10-01', fim: '2026-10-31' })
  })
})
