import { describe, it, expect } from 'vitest'
import { montarFila, type LancamentoBase } from '@/lib/finance/conciliacao/fila'

const conta = { id: 'itau', nome: 'Itaú CC', tipo: 'checking', instituicao: 'Itaú', agencia: '0123', numero: '4521' }
const base = (id: string, amountCents: number, extra: Partial<LancamentoBase> = {}): LancamentoBase => ({
  id, date: '2026-09-12', description: id, amountCents, cardLastDigits: null, importedAt: null, meio: null, conta, vinculoRevisado: false, ...extra,
})
const cand = (id: string) => ({ id, accountId: 'itau', contaNome: 'Itaú CC', date: '2026-09-10', amountCents: -1, description: id, categoriaNome: null, diasDeDiferenca: 2, diferencaCents: 0, outraConta: false, propostaId: null, nomeParecido: false })
const grupo = (counterpartyId: string, ids: string[]) => ({
  counterpartyId, displayName: counterpartyId.toUpperCase(), keyType: 'description' as const, count: ids.length, totalCents: 0, ehCpfProprio: false,
  suggestedCategoryId: 'cat-1', suggestionSource: 'historico' as const,
  items: ids.map((id) => ({ id, date: '2026-09-12', description: id, amountCents: -1, accountId: 'itau', type: 'expense' as const, sugestaoContaId: null })),
})
const dup = (duplicataId: string) => ({ id: `d-${duplicataId}`, manter: { id: 'm', date: '2026-09-12', description: 'm', amountCents: -1 }, duplicata: { id: duplicataId, date: '2026-09-12', description: duplicataId, amountCents: -1 }, contaNome: 'Itaú', horasEntreEmissoes: 3 })

describe('montarFila', () => {
  it('sem decisão aberta não entra', () => {
    const fila = montarFila({ lancamentos: new Map([['a', base('a', -100)]]), candidatas: new Map(), duplicatas: [], grupos: [] })
    expect(fila).toEqual([])
  })
  it('candidata entra; revisado sem vínculo só sai se não houver outra decisão', () => {
    const lancamentos = new Map([['a', base('a', -100, { vinculoRevisado: true })], ['b', base('b', -100, { vinculoRevisado: true })], ['c', base('c', -100)]])
    const candidatas = new Map([['a', [cand('p1')]], ['b', [cand('p2')]], ['c', [cand('p3')]]])
    const fila = montarFila({ lancamentos, candidatas, duplicatas: [], grupos: [grupo('net', ['b'])] })
    expect(fila.map((i) => i.id).sort()).toEqual(['b', 'c'])
    expect(fila.find((i) => i.id === 'b')!.candidatas).toEqual([])
  })
  it('repetidos primeiro, depois maior valor absoluto; um item por lançamento', () => {
    const lancamentos = new Map([['peq', base('peq', -100)], ['gde', base('gde', 900000)], ['dup', base('dup', -50)]])
    const fila = montarFila({
      lancamentos, candidatas: new Map([['gde', [cand('p')]]]),
      duplicatas: [dup('dup')], grupos: [grupo('x', ['peq', 'dup'])],
    })
    expect(fila.map((i) => i.id)).toEqual(['dup', 'gde', 'peq'])
    expect(fila[0].repetido?.propostaId).toBe('d-dup')
    expect(fila[0].classificacao).not.toBeNull()
  })
  it('classificação traz sugestão e quantos outros da contraparte estão na fila', () => {
    const lancamentos = new Map([['a', base('a', -1)], ['b', base('b', -1)], ['c', base('c', -1)]])
    const fila = montarFila({ lancamentos, candidatas: new Map(), duplicatas: [], grupos: [grupo('net', ['a', 'b', 'c'])] })
    expect(fila[0].classificacao).toMatchObject({ counterpartyId: 'net', nature: 'expense', categoryId: 'cat-1', outrosNaFila: 2 })
  })
})
