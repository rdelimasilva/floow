import { describe, it, expect, beforeEach } from 'vitest'
import { acaoDoUsuario, capturarPendentes, registrarDecisoes, registrarEventos } from '@/lib/finance/conciliacao/validacoes'

const selectQueue: unknown[][] = []
const inserts: Record<string, unknown>[][] = []
function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit']) c[m] = () => chain(result)
  return c
}
const tx: any = {
  select: () => chain(selectQueue.shift() ?? []),
  insert: () => ({ values: (v: Record<string, unknown>[]) => { inserts.push(v); return Promise.resolve() } }),
}
beforeEach(() => { selectQueue.length = 0; inserts.length = 0 })

describe('acaoDoUsuario', () => {
  it('aceitou o palpite', () => expect(acaoDoUsuario('cat-1', 'cat-1')).toBe('confirmar'))
  it('trocou o palpite', () => expect(acaoDoUsuario('cat-1', 'cat-2')).toBe('corrigir'))
  it('sem palpite é sempre corrigir', () => expect(acaoDoUsuario(null, 'cat-2')).toBe('corrigir'))
  it('transferência (categoria nula) sem palpite é corrigir', () => expect(acaoDoUsuario(null, null)).toBe('corrigir'))
})

describe('capturarPendentes', () => {
  it('lê o palpite da contraparte e os pendentes', async () => {
    selectQueue.push([{ categoriaId: 'cat-1', origem: 'historico' }], [{ id: 't1' }, { id: 't2' }])
    expect(await capturarPendentes(tx, 'org-1', 'cp-1')).toEqual({
      counterpartyId: 'cp-1', sugestao: { categoriaId: 'cat-1', origem: 'historico' }, ids: ['t1', 't2'],
    })
  })
  it('contraparte sem palpite', async () => {
    selectQueue.push([{ categoriaId: null, origem: null }], [{ id: 't1' }])
    expect((await capturarPendentes(tx, 'org-1', 'cp-1')).sugestao).toEqual({ categoriaId: null, origem: null })
  })
})

describe('registrarDecisoes', () => {
  const captura = { counterpartyId: 'cp-1', sugestao: { categoriaId: 'cat-1', origem: 'claude' as const }, ids: ['t1', 't2', 't3'] }
  it('um evento por lançamento que saiu confirmado, com a categoria final de cada um', async () => {
    // t3 continua pendente (clique duplo, ou ficou fora do lote): sem evento.
    selectQueue.push([
      { id: 't1', type: 'expense', categoryId: 'cat-1' },
      { id: 't2', type: 'expense', categoryId: 'cat-9' },
    ])
    expect(await registrarDecisoes(tx, 'org-1', captura, 'user-1')).toBe(2)
    expect(inserts[0]).toEqual([
      expect.objectContaining({ transactionId: 't1', acao: 'confirmar', categoriaId: 'cat-1', sugestaoCategoriaId: 'cat-1', sugestaoOrigem: 'claude', userId: 'user-1', counterpartyId: 'cp-1', natureza: 'expense' }),
      expect.objectContaining({ transactionId: 't2', acao: 'corrigir', categoriaId: 'cat-9' }),
    ])
  })
  it('nada confirmado: não insere', async () => {
    selectQueue.push([])
    expect(await registrarDecisoes(tx, 'org-1', captura, 'user-1')).toBe(0)
    expect(inserts).toHaveLength(0)
  })
  it('captura vazia: nem consulta', async () => {
    expect(await registrarDecisoes(tx, 'org-1', { ...captura, ids: [] }, 'user-1')).toBe(0)
  })
})

describe('registrarEventos', () => {
  it('grava a ação fixa sem palpite', async () => {
    await registrarEventos(tx, 'org-1', 'regra', null, [{ transactionId: 't1', counterpartyId: 'cp-1', natureza: 'income', categoriaId: 'cat-3' }])
    expect(inserts[0]).toEqual([{ orgId: 'org-1', transactionId: 't1', counterpartyId: 'cp-1', userId: null, acao: 'regra', natureza: 'income', categoriaId: 'cat-3' }])
  })
  it('lista vazia: não insere', async () => {
    await registrarEventos(tx, 'org-1', 'regra', null, [])
    expect(inserts).toHaveLength(0)
  })
})
