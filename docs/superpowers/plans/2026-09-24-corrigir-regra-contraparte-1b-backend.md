# Corrigir regra de contraparte — Plano, parte 1 (backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regra de contraparte confirmada pode ser corrigida, só para o futuro ou também para o histórico, desfazendo os pares de transferência que ela criou.

**Architecture:** O núcleo de `confirmCounterparty` sai para `aplicar-regra.ts` e passa a receber `tx`. `desfazer-par.ts` devolve um lançamento a `pending` (apagando a perna e estornando o saldo), e `corrigirRegra` compõe as duas coisas: desfaz, atualiza a regra e reaplica. A contraparte do CPF do titular nunca grava conta.

**Tech Stack:** Next.js server actions, Drizzle ORM (Postgres/Supabase), zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-corrigir-regra-contraparte-design.md`


## Global Constraints

- Nenhum arquivo passa de 500 linhas (CLAUDE.md). `counterparty-actions.ts` (412) encolhe com a extração da Task 2.
- Nenhuma tela, fila ou item de menu novo (spec §3).
- Saldo é mantido só por código da aplicação (`UPDATE accounts SET balance_cents = balance_cents + delta`). Não há trigger.
- Todo estorno respeita `balance_applied && !is_ignored` (a linha ignorada já saiu do saldo com `balance_applied = true`).
- Toda escrita filtra por `org_id`. Conta de destino passa por `assertAccountOwnership`.
- Texto de UI e comentários em pt-BR ("tela", "você").
- Git: branch `feat/corrigir-regra`. Antes de cada commit, conferir `git branch --show-current` (outra sessão pode ter trocado). Nunca `git add -A`: adicionar os arquivos pelo nome.
- Testes: `cd apps/web && pnpm vitest run <arquivo>`.

## Review Focus

- **Lançamento ignorado com perna real:** a perna herdou `balance_applied = true`, mas se ela está `is_ignored`, estornar tiraria duas vezes. Teste na Task 3.
- **Corrigir para a mesma decisão que já vale:** desfaz e recria o par igual. O saldo líquido tem que ser zero, e o `external_id` derivado não pode colidir (a perna antiga é apagada antes, na mesma transação). Teste na Task 5.
- **Regra de CPF próprio corrigida com histórico:** os lançamentos voltam para Classificar (pendentes), nenhum par é criado e a regra fica sem conta. Teste na Task 5.
- **Lançamento com par vindo do outro lado (forma 3):** fica intocado e é contado como `ignorados`. Teste na Task 5.
- **CNPJ, CPF sem salt ou org sem conexão:** `ehCpfProprio` devolve `false` sem lançar erro. Teste na Task 1.

**Arquivos do plano (executar em ordem):** `2026-09-24-corrigir-regra-contraparte-1a-backend.md` (Tasks 1-2), `2026-09-24-corrigir-regra-contraparte-1b-backend.md` (Task 3), `2026-09-24-corrigir-regra-contraparte-1c-backend.md` (Tasks 4-5), `2026-09-24-corrigir-regra-contraparte-2a-tela.md` (Tasks 6-7), `2026-09-24-corrigir-regra-contraparte-2b-tela.md` (Task 8), `2026-09-24-corrigir-regra-contraparte-2c-tela.md` (Tasks 9-10).

---

### Task 3: Desfazer o par de um lançamento

**Files:**
- Create: `apps/web/lib/openfinance/desfazer-par.ts`
- Create: `apps/web/__tests__/openfinance/_fake-tx.ts` (tx falso reutilizável)
- Test: `apps/web/__tests__/openfinance/desfazer-par.test.ts`

**Interfaces:**
- Produces:
  - `type FormaDoPar = 'perna-real' | 'perna-prevista' | 'par-do-outro-lado' | 'sem-par'`
  - `interface LancamentoDaRegra { id: string; accountId: string; amountCents: number; description: string; transferGroupId: string | null; balanceApplied: boolean }`
  - `interface PernaDoGrupo { id: string; accountId: string; amountCents: number; externalId: string | null; balanceApplied: boolean; isIgnored: boolean; matchedTransactionId: string | null }`
  - `interface AnaliseDoPar { forma: FormaDoPar; pernas: PernaDoGrupo[]; estorno: Record<string, number> }`. `estorno` é o delta de saldo por conta ao desfazer.
  - `analisarPar(tx: Pick<Db, 'select'>, orgId: string, l: LancamentoDaRegra): Promise<AnaliseDoPar>` (só lê)
  - `desfazerParDaRegra(tx: Db, orgId: string, l: LancamentoDaRegra): Promise<AnaliseDoPar & { realizadoDevolvidoId: string | null }>`

- [ ] **Step 1: Criar o tx falso**

```ts
// apps/web/__tests__/openfinance/_fake-tx.ts
import { getTableName } from 'drizzle-orm'

export interface FakeOp { op: 'select' | 'update' | 'insert' | 'delete'; table: string; set?: Record<string, unknown>; values?: unknown }

/**
 * Tx falso no estilo de `counterparty-actions-par.test.ts`: cada `select`
 * consome a próxima resposta de `selects`, e toda escrita fica em `ops`.
 */
export function fakeTx(selects: unknown[][]) {
  const ops: FakeOp[] = []
  const chain = (result: unknown[], op?: FakeOp): any => {
    const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
    for (const m of ['from', 'where', 'limit', 'orderBy', 'innerJoin', 'leftJoin', 'returning', 'onConflictDoNothing']) c[m] = () => chain(result, op)
    c.set = (payload: Record<string, unknown>) => { if (op) op.set = payload; return chain(result, op) }
    return c
  }
  const tx: any = {
    select: () => { const op: FakeOp = { op: 'select', table: '' }; ops.push(op); return { from: (t: any) => { op.table = getTableName(t); return chain(selects.shift() ?? [], op) } } },
    update: (t: any) => { const op: FakeOp = { op: 'update', table: getTableName(t) }; ops.push(op); return chain([], op) },
    insert: (t: any) => ({ values: (v: unknown) => { ops.push({ op: 'insert', table: getTableName(t), values: v }); return chain([{ id: 'nova' }]) } }),
    delete: (t: any) => { const op: FakeOp = { op: 'delete', table: getTableName(t) }; ops.push(op); return chain([], op) },
  }
  return { tx, ops }
}
```

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { desfazerParDaRegra, type LancamentoDaRegra } from '@/lib/openfinance/desfazer-par'
import { fakeTx } from './_fake-tx'

const ORG = 'org-1'
const base: LancamentoDaRegra = { id: 'l1', accountId: 'itau', amountCents: 400100, description: 'Resgate CDB DI', transferGroupId: 'g1', balanceApplied: true }
const perna = (o: Partial<Record<string, unknown>> = {}) => ({ id: 'p1', accountId: 'xp', amountCents: -400100, externalId: 'ext:transfer-dest', balanceApplied: true, isIgnored: false, matchedTransactionId: null, ...o })

describe('desfazerParDaRegra', () => {
  it('perna real aplicada: estorna na outra conta, apaga a perna e volta a pendente', async () => {
    const { tx, ops } = fakeTx([[perna()]])
    const r = await desfazerParDaRegra(tx, ORG, base)
    expect(r.forma).toBe('perna-real')
    expect(r.estorno).toEqual({ xp: 400100 })
    expect(ops.map((o) => `${o.op}:${o.table}`)).toEqual(['select:transactions', 'update:accounts', 'delete:transactions', 'update:transactions'])
    expect(ops[3].set).toEqual({ reviewState: 'pending', transferGroupId: null, transferAccountId: null })
  })

  it('perna real ignorada: não estorna de novo', async () => {
    const { tx, ops } = fakeTx([[perna({ isIgnored: true })]])
    const r = await desfazerParDaRegra(tx, ORG, base)
    expect(r.estorno).toEqual({})
    expect(ops.some((o) => o.table === 'accounts')).toBe(false)
  })

  it('perna real não aplicada (futura): não estorna', async () => {
    const { tx } = fakeTx([[perna({ balanceApplied: false })]])
    expect((await desfazerParDaRegra(tx, ORG, base)).estorno).toEqual({})
  })

  it('perna prevista conciliada: apaga a perna e devolve o realizado a pendente', async () => {
    const { tx, ops } = fakeTx([[perna({ externalId: 'ext:transfer-par', balanceApplied: false, matchedTransactionId: 'r1' })]])
    const r = await desfazerParDaRegra(tx, ORG, base)
    expect(r.forma).toBe('perna-prevista')
    expect(r.realizadoDevolvidoId).toBe('r1')
    expect(ops.some((o) => o.table === 'accounts')).toBe(false)
    expect(ops.find((o) => o.op === 'update' && (o.set as any)?.transferAccountId === null && (o.set as any)?.reviewState === 'pending' && !('transferGroupId' in (o.set as any)))).toBeTruthy()
  })

  it('ponta esperada pelo outro lado: não toca em nada', async () => {
    const { tx, ops } = fakeTx([[{ id: 'perna-de-la' }]])
    const r = await desfazerParDaRegra(tx, ORG, { ...base, transferGroupId: null })
    expect(r.forma).toBe('par-do-outro-lado')
    expect(ops.filter((o) => o.op !== 'select')).toEqual([])
  })

  it('sem grupo e sem ninguém esperando: só volta a pendente', async () => {
    const { tx, ops } = fakeTx([[], []])
    const r = await desfazerParDaRegra(tx, ORG, { ...base, transferGroupId: null })
    expect(r.forma).toBe('sem-par')
    expect(ops.filter((o) => o.op !== 'select').map((o) => `${o.op}:${o.table}`)).toEqual(['update:transactions'])
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/desfazer-par.test.ts`
Expected: FAIL (módulo inexistente)

- [ ] **Step 4: Implement**

```ts
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { getDb, accounts, transactions, forecastMatchProposals } from '@floow/db'
import { ehPernaPrevista } from './perna-prevista'

type Db = ReturnType<typeof getDb>

export type FormaDoPar = 'perna-real' | 'perna-prevista' | 'par-do-outro-lado' | 'sem-par'

export interface LancamentoDaRegra {
  id: string
  accountId: string
  amountCents: number
  description: string
  transferGroupId: string | null
  balanceApplied: boolean
}

export interface PernaDoGrupo {
  id: string
  accountId: string
  amountCents: number
  externalId: string | null
  balanceApplied: boolean
  isIgnored: boolean
  matchedTransactionId: string | null
}

export interface AnaliseDoPar {
  forma: FormaDoPar
  pernas: PernaDoGrupo[]
  /** Delta de saldo por conta que desfazer aplica: o contrário da perna real que estava no saldo. */
  estorno: Record<string, number>
}

/**
 * Lê o par de um lançamento que uma regra classificou como transferência e
 * diz de que forma ele é (spec §5). Só lê: a prévia usa esta mesma função,
 * para os números da tela baterem com o que `desfazerParDaRegra` grava.
 */
export async function analisarPar(tx: Pick<Db, 'select'>, orgId: string, l: LancamentoDaRegra): Promise<AnaliseDoPar> {
  if (l.transferGroupId) {
    const pernas: PernaDoGrupo[] = await tx
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        amountCents: transactions.amountCents,
        externalId: transactions.externalId,
        balanceApplied: transactions.balanceApplied,
        isIgnored: transactions.isIgnored,
        matchedTransactionId: transactions.matchedTransactionId,
      })
      .from(transactions)
      .where(and(eq(transactions.orgId, orgId), eq(transactions.transferGroupId, l.transferGroupId), ne(transactions.id, l.id)))

    if (pernas.length === 0) return { forma: 'sem-par', pernas, estorno: {} }
    const prevista = pernas.every((p) => ehPernaPrevista(p.externalId))
    const estorno: Record<string, number> = {}
    if (!prevista) {
      for (const p of pernas) {
        // Ignorada já saiu do saldo mantendo `balance_applied = true`
        // (toggleIgnoreTransaction): estornar de novo tiraria duas vezes.
        if (p.balanceApplied && !p.isIgnored) estorno[p.accountId] = (estorno[p.accountId] ?? 0) - p.amountCents
      }
    }
    return { forma: prevista ? 'perna-prevista' : 'perna-real', pernas, estorno }
  }

  // Sem grupo: pode ser a ponta que a perna prevista de OUTRA conta espera.
  // Esse par foi decidido pela regra de lá; corrigir esta regra não o desfaz.
  const [casada] = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.matchedTransactionId, l.id)))
    .limit(1)
  if (casada) return { forma: 'par-do-outro-lado', pernas: [], estorno: {} }

  const [proposta] = await tx
    .select({ id: forecastMatchProposals.id })
    .from(forecastMatchProposals)
    .where(and(
      eq(forecastMatchProposals.orgId, orgId),
      eq(forecastMatchProposals.realizedTransactionId, l.id),
      eq(forecastMatchProposals.status, 'pending'),
    ))
    .limit(1)
  if (proposta) return { forma: 'par-do-outro-lado', pernas: [], estorno: {} }

  return { forma: 'sem-par', pernas: [], estorno: {} }
}

/**
 * Devolve o lançamento a `pending`, sem grupo e sem conta de destino, e
 * desfaz o que o par dele criou. O saldo do próprio lançamento não muda: é
 * dinheiro real do banco, e o valor com sinal é o mesmo em qualquer natureza.
 * Roda dentro da transação de `corrigirRegra`, que reaplica logo depois.
 */
export async function desfazerParDaRegra(
  tx: Db,
  orgId: string,
  l: LancamentoDaRegra,
): Promise<AnaliseDoPar & { realizadoDevolvidoId: string | null }> {
  const analise = await analisarPar(tx, orgId, l)
  if (analise.forma === 'par-do-outro-lado') return { ...analise, realizadoDevolvidoId: null }

  for (const [contaId, delta] of Object.entries(analise.estorno)) {
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${delta}` })
      .where(and(eq(accounts.id, contaId), eq(accounts.orgId, orgId)))
  }

  let realizadoDevolvidoId: string | null = null
  if (analise.forma === 'perna-prevista') {
    const casada = analise.pernas.find((p) => p.matchedTransactionId)
    if (casada?.matchedTransactionId) {
      // `aprovarProposta` converteu o lançamento do outro banco em
      // transferência para cá. Sem a perna, esse par não existe mais: ele
      // volta para Classificar, como transferência sem conta.
      await tx
        .update(transactions)
        .set({ reviewState: 'pending', transferAccountId: null })
        .where(and(eq(transactions.id, casada.matchedTransactionId), eq(transactions.orgId, orgId)))
      realizadoDevolvidoId = casada.matchedTransactionId
    }
  }

  if (analise.pernas.length > 0) {
    // Apagar ANTES de reaplicar: o `external_id` derivado (`:transfer-dest`/
    // `:transfer-par`) volta a ser inserido e colidiria no índice único.
    // Propostas contra a perna caem por CASCADE (00047).
    await tx
      .delete(transactions)
      .where(and(eq(transactions.orgId, orgId), inArray(transactions.id, analise.pernas.map((p) => p.id))))
  }

  await tx
    .update(transactions)
    .set({ reviewState: 'pending', transferGroupId: null, transferAccountId: null })
    .where(and(eq(transactions.id, l.id), eq(transactions.orgId, orgId)))

  return { ...analise, realizadoDevolvidoId }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/desfazer-par.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/web/lib/openfinance/desfazer-par.ts apps/web/__tests__/openfinance/_fake-tx.ts apps/web/__tests__/openfinance/desfazer-par.test.ts
git commit -m "feat(contraparte): desfaz o par que uma regra criou, estornando o saldo"
```

---

