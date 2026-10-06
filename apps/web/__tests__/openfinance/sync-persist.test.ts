import { describe, it, expect, vi, beforeEach } from 'vitest'
import { persistPage, sumAppliedDeltasByAccount } from '@/lib/openfinance/persist-page'
import type { ResolvedTransaction } from '@/lib/openfinance/resolve-counterparty'

vi.mock('@/lib/finance/conciliacao/validacoes', () => ({ registrarEventos: vi.fn(async () => {}) }))
const { registrarEventos } = await import('@/lib/finance/conciliacao/validacoes')

/**
 * `persistPage` não é exportada (é interna a sync.ts) e o resto da função
 * depende de um mock de `db` grande demais para valer a pena aqui. Este
 * teste isola só a regra nova: quem decide a categoria quando há contraparte
 * versus quando não há. Extraída para uma função pura testável em vez de
 * inline, porque é a única peça de lógica condicional nova desta task.
 */
function resolveCategoryId(
  tx: { counterpartyId: string | null; categoryId: string | null; description: string; categoryRef: string | null },
  rules: Array<{ pattern: string; categoryId: string }>,
  categoryByRef: Map<string, string>,
): string | null {
  if (tx.counterpartyId !== null) return tx.categoryId
  const matched = rules.find((r) => tx.description.includes(r.pattern))
  return matched?.categoryId ?? (tx.categoryRef ? (categoryByRef.get(tx.categoryRef) ?? null) : null)
}

describe('categoria: contraparte é autoritativa, Nível 1 usa o caminho antigo', () => {
  it('com contraparte, category_rules e category_ref nunca são consultados', () => {
    const tx = { counterpartyId: 'cp-1', categoryId: 'cat-confirmada', description: 'ALUGUEL', categoryRef: 'RENT_AND_UTILITIES_RENT' }
    const id = resolveCategoryId(tx, [{ pattern: 'ALUGUEL', categoryId: 'cat-regra' }], new Map([['RENT_AND_UTILITIES_RENT', 'cat-ref']]))
    expect(id).toBe('cat-confirmada')
  })

  it('contraparte pendente força categoria null, mesmo com regra e category_ref batendo', () => {
    const tx = { counterpartyId: 'cp-2', categoryId: null, description: 'ALUGUEL', categoryRef: 'RENT_AND_UTILITIES_RENT' }
    const id = resolveCategoryId(tx, [{ pattern: 'ALUGUEL', categoryId: 'cat-regra' }], new Map([['RENT_AND_UTILITIES_RENT', 'cat-ref']]))
    expect(id).toBeNull()
  })

  it('sem contraparte (Nível 1), category_rules continua tendo prioridade sobre category_ref', () => {
    const tx = { counterpartyId: null, categoryId: null, description: 'ALUGUEL', categoryRef: 'RENT_AND_UTILITIES_RENT' }
    const id = resolveCategoryId(tx, [{ pattern: 'ALUGUEL', categoryId: 'cat-regra' }], new Map([['RENT_AND_UTILITIES_RENT', 'cat-ref']]))
    expect(id).toBe('cat-regra')
  })

  it('sem contraparte e sem regra, cai para category_ref', () => {
    const tx = { counterpartyId: null, categoryId: null, description: 'X', categoryRef: 'RENT_AND_UTILITIES_RENT' }
    const id = resolveCategoryId(tx, [], new Map([['RENT_AND_UTILITIES_RENT', 'cat-ref']]))
    expect(id).toBe('cat-ref')
  })
})

/**
 * `sumAppliedDeltasByAccount` é importada de verdade de `sync.ts` (não uma
 * cópia local, ao contrário de `resolveCategoryId`/`decideTransferLeg`
 * acima): é a mesma função que `persistPage` usa para o delta da perna de
 * destino, então o teste cobre a implementação real, não uma reimplementação
 * paralela dela. Achado da revisão final: a rodada anterior só testava a
 * ORDEM das operações de DB, nunca o VALOR do delta nem o filtro por
 * `balanceApplied` — por isso a falta de gate em `counterparty-actions.ts`
 * (Critical 1) passou por duas revisões sem ser pega.
 */
describe('sumAppliedDeltasByAccount', () => {
  it('perna com applied: false não contribui em nada para o saldo da conta', () => {
    const delta = sumAppliedDeltasByAccount([{ accountId: 'conta-1', amountCents: 50000, applied: false }])
    expect(delta.has('conta-1')).toBe(false)
    expect(delta.get('conta-1')).toBeUndefined()
  })

  it('perna com applied: true contribui com o próprio valor', () => {
    const delta = sumAppliedDeltasByAccount([{ accountId: 'conta-1', amountCents: 50000, applied: true }])
    expect(delta.get('conta-1')).toBe(50000)
  })

  it('múltiplas pernas na mesma conta somam corretamente, ignorando as não aplicadas', () => {
    const delta = sumAppliedDeltasByAccount([
      { accountId: 'conta-1', amountCents: 50000, applied: true },
      { accountId: 'conta-1', amountCents: 20000, applied: true },
      { accountId: 'conta-1', amountCents: 999999, applied: false },
      { accountId: 'conta-2', amountCents: -1000, applied: true },
    ])
    expect(delta.get('conta-1')).toBe(70000)
    expect(delta.get('conta-2')).toBe(-1000)
    expect(delta.size).toBe(2)
  })
})

/**
 * `persistPage` registra evento de validação (Task 4, spec 2026-10-06) para
 * cada linha nova cuja contraparte confirmada decidiu a categoria sozinha —
 * é a regra do usuário, aplicada no sync. Linha pendente (contraparte ainda
 * não decidiu) não entra: ela segue para a fila de classificar.
 */
describe('persistPage — regra aplicada no sync grava evento de validação', () => {
  const ORG = 'org-1'

  function linha(over: Partial<ResolvedTransaction> = {}): ResolvedTransaction {
    return {
      externalId: 'ext-1',
      date: '2026-09-10',
      amountCents: -5000,
      type: 'expense',
      natureConfirmed: false,
      counterpartyTaxId: null,
      counterpartyName: null,
      description: 'MERCADO',
      categoryRef: null,
      polpType: null,
      payeeMcc: null,
      billPostDate: null,
      billForecastMonth: null,
      installmentNumber: null,
      installmentTotal: null,
      purchaseDate: null,
      settlement: 'settled',
      foreign: null,
      reviewState: 'pending',
      counterpartyId: null,
      categoryId: null,
      transferAccountId: null,
      ...over,
    } as ResolvedTransaction
  }

  const input = (normalized: ResolvedTransaction[]) => ({
    orgId: ORG, accountId: 'nubank', normalized, categoryByRef: new Map<string, string>(), rules: [],
  })

  function chain(result: unknown[]): any {
    const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
    for (const m of ['from', 'where', 'limit', 'set', 'onConflictDoNothing']) c[m] = () => c
    return c
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registra evento só para a linha com contraparte confirmada; a pendente fica de fora', async () => {
    const selectQueue: unknown[][] = []
    selectQueue.push([]) // existentes: nenhuma

    const db: any = {
      select: () => chain(selectQueue.shift() ?? []),
      update: () => chain([]),
      insert: () => ({
        values: (v: any[]) => ({
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve(v.map((row, i) => ({
              id: `novo-${i}`,
              amountCents: row.amountCents,
              applied: row.balanceApplied,
              counterpartyId: row.counterpartyId,
              reviewState: row.reviewState,
              type: row.type,
              categoryId: row.categoryId,
            }))),
          }),
        }),
      }),
      transaction: async (fn: (t: unknown) => unknown) => fn(db),
    }

    const confirmada = linha({ externalId: 'ext-confirmada', counterpartyId: 'cp-1', categoryId: 'cat-1', reviewState: 'confirmed', type: 'expense' })
    const pendente = linha({ externalId: 'ext-pendente', counterpartyId: 'cp-2', categoryId: null, reviewState: 'pending' })

    await persistPage(db, input([confirmada, pendente]))

    expect(registrarEventos).toHaveBeenCalledWith(expect.anything(), ORG, 'regra', null, [
      { transactionId: expect.any(String), counterpartyId: 'cp-1', natureza: 'expense', categoriaId: 'cat-1' },
    ])
  })
})
