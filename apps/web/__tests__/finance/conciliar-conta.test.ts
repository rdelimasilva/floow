import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const ordem: string[] = []

vi.mock('@/lib/finance/conciliacao/reclassificar-conta', () => ({
  inicioDoExtrato: vi.fn(async () => '2026-01-01'),
  reclassificarConta: vi.fn(async () => { ordem.push('reclassificar'); return { reclassificadas: 2, estornoCents: 32300 } }),
}))
vi.mock('@/lib/finance/conciliacao/r1-db', () => ({
  aplicarR1: vi.fn(async () => { ordem.push('r1'); return { absorvidas: [{ aguardandoId: 'a', extratoId: 'e' }], propostas: 1 } }),
}))
vi.mock('@/lib/finance/duplicata-db', () => ({
  criarPropostasDeDuplicata: vi.fn(async () => { ordem.push('r2'); return 3 }),
}))
vi.mock('@/lib/finance/forecast-match-db', () => ({
  criarPropostasDeConciliacao: vi.fn(async () => { ordem.push('r3'); return 4 }),
}))
let conciliavel = true
vi.mock('@/lib/finance/conciliacao/conta-conciliavel', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  contaConciliavel: vi.fn(async () => conciliavel),
}))

let recurso: unknown[] = [{ syncFromDate: '2026-01-01' }]
const locks: unknown[][] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit']) c[m] = () => c
  return c
}
const db: any = {
  select: () => chain(recurso),
  execute: async (q: SQL) => { locks.push(new PgDialect().sqlToQuery(q).params); ordem.push('lock') },
  transaction: async (fn: (tx: unknown) => unknown) => fn(db),
}

const { conciliarConta, conciliarContas } = await import('@/lib/finance/conciliacao/conciliar-conta')
const { aplicarR1 } = await import('@/lib/finance/conciliacao/r1-db')
const { criarPropostasDeConciliacao } = await import('@/lib/finance/forecast-match-db')

beforeEach(() => {
  ordem.length = 0; locks.length = 0; recurso = [{ syncFromDate: '2026-01-01' }]; conciliavel = true
  vi.mocked(criarPropostasDeConciliacao).mockClear()
})

describe('conciliarConta', () => {
  it('trava a conta e roda reclassificar → R1 → R2 → R3, nessa ordem', async () => {
    await conciliarConta(db, 'org-1', 'nubank')
    expect(ordem).toEqual(['lock', 'reclassificar', 'r1', 'r2', 'r3'])
    expect(locks[0]).toContain('conciliar-conta:nubank')
  })

  it('soma o resumo: propostas de R1 e de R3 juntas', async () => {
    const r = await conciliarConta(db, 'org-1', 'nubank')
    expect(r).toEqual({
      reclassificadas: 2,
      estornoCents: 32300,
      absorvidas: [{ aguardandoId: 'a', extratoId: 'e' }],
      propostasDeConciliacao: 5,
      propostasDeDuplicata: 3,
    })
  })

  it('conta conciliável: R3 fica só com recorrência (:transfer-par é de R1)', async () => {
    await conciliarConta(db, 'org-1', 'nubank')
    expect(criarPropostasDeConciliacao).toHaveBeenCalledWith(db, 'org-1', 'nubank', { incluirPernaPrevista: false })
  })

  it('cartão Open Finance (não conciliável): pula reclassificação e R1; R2 e R3 rodam, com :transfer-par em R3', async () => {
    conciliavel = false
    const r = await conciliarConta(db, 'org-1', 'cartao')
    expect(ordem).toEqual(['lock', 'r2', 'r3'])
    expect(criarPropostasDeConciliacao).toHaveBeenCalledWith(db, 'org-1', 'cartao', { incluirPernaPrevista: true })
    expect(r).toEqual({ reclassificadas: 0, estornoCents: 0, absorvidas: [], propostasDeConciliacao: 4, propostasDeDuplicata: 3 })
  })

  it('conta sem Open Finance vivo: não faz nada', async () => {
    recurso = []
    const r = await conciliarConta(db, 'org-1', 'manual')
    expect(ordem).toEqual([])
    expect(r.propostasDeConciliacao).toBe(0)
  })
})

describe('conciliarContas', () => {
  it('uma conta repetida roda uma vez; falha numa não impede a outra nem sobe', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(aplicarR1).mockRejectedValueOnce(new Error('boom'))
    const r = await conciliarContas(db, 'org-1', ['c1', 'c1', 'c2'], '[teste]')
    expect(ordem.filter((o) => o === 'lock')).toHaveLength(2)
    expect(r.propostasDeDuplicata).toBe(3)
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('[teste]'), expect.any(Error))
    erro.mockRestore()
  })
})
