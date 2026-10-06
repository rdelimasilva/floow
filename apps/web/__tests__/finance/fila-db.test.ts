import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/db/rls', () => ({ withUserDb: vi.fn(), withUserDbFor: vi.fn() }))
vi.mock('@/lib/finance/duplicata-queries', () => ({ lerDuplicatasPendentes: vi.fn(async () => []) }))
vi.mock('@/lib/finance/forecast-match-queries', () => ({ lerPropostasPendentes: vi.fn(async () => []) }))
vi.mock('@/lib/openfinance/counterparty-queries', () => ({ lerGruposPendentes: vi.fn(async () => []) }))
const { contar, lerFila } = await import('@/lib/finance/conciliacao/fila-db')

const item = (p: Record<string, unknown>) => ({ candidatas: [], repetido: null, classificacao: null, ...p }) as any

describe('contar', () => {
  it('total é de lançamentos distintos; cada tipo conta o seu', () => {
    const c = contar([
      item({ repetido: {}, classificacao: {} }),
      item({ candidatas: [{}] }),
      item({ classificacao: {}, candidatas: [{}] }),
    ])
    expect(c).toEqual({ repetidos: 1, classificar: 2, confirmar: 2, total: 3 })
  })
})

/** As consultas de `lerFila`, na ordem: recentes, previsões, recusas, linhas do lançamento. */
function dbCom(respostas: unknown[][]): any {
  const fila = [...respostas]
  const chain = (r: unknown[]): any => {
    const c: any = { then: (ok: (v: unknown) => unknown) => Promise.resolve(r).then(ok) }
    for (const m of ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy', 'limit']) c[m] = () => c
    return c
  }
  return { select: () => chain(fila.shift() ?? []) }
}

describe('lerFila', () => {
  it('compara a descrição do banco com a da previsão e traz o meio do lançamento', async () => {
    const hoje = new Date('2026-09-20T12:00:00Z')
    const db = dbCom([
      [{ id: 'r1', accountId: 'itau', date: '2026-09-12', amountCents: -360000, description: 'PIX JUSSARA SILVA' }],
      [{ id: 'p1', accountId: 'itau', contaNome: 'Itaú', date: '2026-09-11', amountCents: -300000, description: 'Jussara - Diarista', categoriaNome: null }],
      [],
      [{
        id: 'r1', date: '2026-09-12', description: 'PIX JUSSARA SILVA', amountCents: -360000, cardLastDigits: null, importedAt: null,
        vinculoRevisadoEm: null, polpType: 'PIX', contaId: 'itau', contaNome: 'Itaú', contaTipo: 'checking', agencia: null, numero: null, instituicao: 'Itaú',
      }],
    ])
    const [r] = await lerFila(db, 'org-1', hoje)
    expect(r.meio).toBe('Pix')
    expect(r.candidatas.map((c) => [c.id, c.nomeParecido])).toEqual([['p1', true]])
  })
})
