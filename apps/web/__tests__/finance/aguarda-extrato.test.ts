import { describe, it, expect, beforeEach } from 'vitest'
import { aguardaExtratoNaConta, aguardaNaData, type ExtratoDaConta } from '@/lib/finance/conciliacao/aguarda-extrato'

/**
 * A linha nasce aguardando só em conta conciliável (corrente/poupança com
 * Open Finance vivo; cartão não — Ruling P12), só para as origens
 * que o extrato cobre, e só a partir do início do extrato — o mesmo corte de
 * `reclassificarConta` (spec §3.2). Antes dele nenhum extrato vai cobrir o
 * período: a linha é a única representação do fato e fica no saldo.
 */
const OF_DESDE_SETEMBRO: ExtratoDaConta = { conciliavel: true, desde: '2026-09-01' }

describe('aguardaNaData', () => {
  it('conta manual: nunca aguarda', () => {
    expect(aguardaNaData({ conciliavel: false }, 'manual', '2026-09-20')).toBe(false)
  })

  it('conta OF, data no período do extrato (inclusive o dia do corte): aguarda', () => {
    expect(aguardaNaData(OF_DESDE_SETEMBRO, 'manual', '2026-09-20')).toBe(true)
    expect(aguardaNaData(OF_DESDE_SETEMBRO, 'arquivo', '2026-09-01')).toBe(true)
  })

  it('conta OF, data antes do corte: fica no saldo', () => {
    expect(aguardaNaData(OF_DESDE_SETEMBRO, 'perna', '2026-08-31')).toBe(false)
  })

  it('conta OF sem extrato ainda: aguarda (o primeiro extrato cobre)', () => {
    expect(aguardaNaData({ conciliavel: true, desde: null }, 'manual', '2020-01-01')).toBe(true)
  })

  it('origem que o extrato não cobre: não aguarda', () => {
    expect(aguardaNaData(OF_DESDE_SETEMBRO, 'recorrencia', '2026-09-20')).toBe(false)
  })
})

const selectQueue: unknown[][] = []
function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit']) c[m] = () => c
  return c
}
const db: any = { select: () => chain(selectQueue.shift() ?? []) }

beforeEach(() => { selectQueue.length = 0 })

describe('aguardaExtratoNaConta', () => {
  it('usa o sync_from_date do recurso vivo como corte', async () => {
    selectQueue.push([{ id: 'recurso' }], [{ syncFromDate: '2026-09-01' }])
    expect(await aguardaExtratoNaConta(db, 'org-1', 'nubank', 'manual', '2026-08-15')).toBe(false)
    selectQueue.push([{ id: 'recurso' }], [{ syncFromDate: '2026-09-01' }])
    expect(await aguardaExtratoNaConta(db, 'org-1', 'nubank', 'manual', '2026-09-15')).toBe(true)
  })

  it('sem sync_from_date: o corte é a primeira linha do extrato', async () => {
    selectQueue.push([{ id: 'recurso' }], [{ syncFromDate: null }], [{ inicio: '2026-07-01' }])
    expect(await aguardaExtratoNaConta(db, 'org-1', 'nubank', 'arquivo', '2026-06-30')).toBe(false)
  })

  it('conta não conciliável (manual ou cartão Open Finance): não aguarda e nem busca o corte', async () => {
    selectQueue.push([])
    expect(await aguardaExtratoNaConta(db, 'org-1', 'itau', 'manual', '2026-09-15')).toBe(false)
    expect(selectQueue).toEqual([])
  })
})
