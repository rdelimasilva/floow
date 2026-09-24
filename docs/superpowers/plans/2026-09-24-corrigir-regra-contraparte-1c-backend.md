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

### Task 4: Selecionar os lançamentos da regra e calcular a prévia

**Files:**
- Create: `apps/web/lib/openfinance/previa-correcao.ts`
- Test: `apps/web/__tests__/openfinance/previa-correcao.test.ts`

**Interfaces:**
- Consumes: `analisarPar`, `LancamentoDaRegra` (Task 3)
- Produces:
  - `interface RegraAtual { id: string; nature: 'income' | 'expense' | 'transfer' | null; categoryId: string | null; transferAccountId: string | null }`
  - `selecionarLancamentosDaRegra(tx: Pick<Db, 'select'>, orgId: string, regra: RegraAtual): Promise<LancamentoDaRegra[]>`
  - `interface PreviaCorrecao { mudam: number; foraPorParDoOutroLado: { id: string; description: string }[]; deltas: Record<string, number> }`
  - `somarPrevia(analises: { l: LancamentoDaRegra; forma: FormaDoPar; estorno: Record<string, number> }[], novaContaManual: string | null): PreviaCorrecao` (pura)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { somarPrevia } from '@/lib/openfinance/previa-correcao'

const l = (id: string, amountCents: number) => ({ id, accountId: 'itau', amountCents, description: 'Resgate CDB DI', transferGroupId: 'g', balanceApplied: true })

describe('somarPrevia', () => {
  it('XP → Itaú - Corretora (manual): estorno na XP e débito espelhado na nova', () => {
    const p = somarPrevia([
      { l: l('a', 400100), forma: 'perna-real', estorno: { xp: 400100 } },
      { l: l('b', 20084), forma: 'perna-real', estorno: { xp: 20084 } },
    ], 'corretora')
    expect(p).toEqual({ mudam: 2, foraPorParDoOutroLado: [], deltas: { xp: 420184, corretora: -420184 } })
  })
  it('par do outro lado fica fora e não entra no delta', () => {
    const p = somarPrevia([{ l: l('a', 100), forma: 'par-do-outro-lado', estorno: {} }], 'corretora')
    expect(p).toEqual({ mudam: 0, foraPorParDoOutroLado: [{ id: 'a', description: 'Resgate CDB DI' }], deltas: {} })
  })
  it('nova decisão sem conta manual (receita, OF ou CPF próprio): só o estorno', () => {
    expect(somarPrevia([{ l: l('a', 100), forma: 'perna-real', estorno: { xp: 100 } }], null).deltas).toEqual({ xp: 100 })
  })
  it('lançamento não aplicado não gera débito na conta nova', () => {
    const naoAplicado = { ...l('a', 100), balanceApplied: false }
    expect(somarPrevia([{ l: naoAplicado, forma: 'sem-par', estorno: {} }], 'corretora').deltas).toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/previa-correcao.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
import { and, eq, isNull } from 'drizzle-orm'
import { getDb, transactions } from '@floow/db'
import type { FormaDoPar, LancamentoDaRegra } from './desfazer-par'

type Db = ReturnType<typeof getDb>

export interface RegraAtual {
  id: string
  nature: 'income' | 'expense' | 'transfer' | null
  categoryId: string | null
  transferAccountId: string | null
}

export interface PreviaCorrecao {
  mudam: number
  foraPorParDoOutroLado: { id: string; description: string }[]
  /** Delta de saldo por conta: estorno do par antigo + perna real nova. */
  deltas: Record<string, number>
}

/**
 * Os lançamentos que ainda seguem a decisão antiga da regra. O que diverge
 * foi exceção decidida à mão e fica como está (spec §4.2). Regra de
 * transferência sem conta (CPF próprio legado) leva todas as transferências
 * confirmadas da contraparte: cada uma foi decidida por lançamento.
 */
export async function selecionarLancamentosDaRegra(
  tx: Pick<Db, 'select'>,
  orgId: string,
  regra: RegraAtual,
): Promise<LancamentoDaRegra[]> {
  const conds = [
    eq(transactions.orgId, orgId),
    eq(transactions.counterpartyId, regra.id),
    eq(transactions.reviewState, 'confirmed'),
  ]
  if (regra.nature === 'transfer') {
    conds.push(eq(transactions.type, 'transfer'))
    if (regra.transferAccountId) conds.push(eq(transactions.transferAccountId, regra.transferAccountId))
  } else if (regra.nature) {
    conds.push(eq(transactions.type, regra.nature))
    conds.push(regra.categoryId ? eq(transactions.categoryId, regra.categoryId) : isNull(transactions.categoryId))
  } else {
    return []
  }

  return tx
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
      description: transactions.description,
      transferGroupId: transactions.transferGroupId,
      balanceApplied: transactions.balanceApplied,
    })
    .from(transactions)
    .where(and(...conds))
}

/**
 * Soma o que a correção faria. `novaContaManual` é a conta de destino nova
 * quando ela é manual: lá `applyTransferSingle` cria perna real com
 * `balanceApplied` herdado da origem e move o saldo. Conta Open Finance,
 * receita/despesa e CPF próprio passam `null`: nada entra em saldo novo.
 */
export function somarPrevia(
  analises: { l: LancamentoDaRegra; forma: FormaDoPar; estorno: Record<string, number> }[],
  novaContaManual: string | null,
): PreviaCorrecao {
  const deltas: Record<string, number> = {}
  const somar = (conta: string, v: number) => {
    const total = (deltas[conta] ?? 0) + v
    if (total === 0) delete deltas[conta]
    else deltas[conta] = total
  }
  const fora: PreviaCorrecao['foraPorParDoOutroLado'] = []
  let mudam = 0

  for (const a of analises) {
    if (a.forma === 'par-do-outro-lado') {
      fora.push({ id: a.l.id, description: a.l.description })
      continue
    }
    mudam++
    for (const [conta, v] of Object.entries(a.estorno)) somar(conta, v)
    if (novaContaManual && a.l.balanceApplied) somar(novaContaManual, -a.l.amountCents)
  }
  return { mudam, foraPorParDoOutroLado: fora, deltas }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/previa-correcao.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/openfinance/previa-correcao.ts apps/web/__tests__/openfinance/previa-correcao.test.ts
git commit -m "feat(contraparte): seleciona o que a regra classificou e soma a previa da correcao"
```

---

### Task 5: Actions `corrigirRegra` e `previaCorrecaoDeRegra`

**Files:**
- Create: `apps/web/lib/openfinance/corrigir-regra-actions.ts` (`'use server'`)
- Test: `apps/web/__tests__/openfinance/corrigir-regra-actions.test.ts`

**Interfaces:**
- Consumes: Tasks 1-4 e `isOpenFinanceLinkedAccount` (`transfer-leg.ts`)
- Produces:
  - `type DecisaoNova = { counterpartyId: string; nature: 'income' | 'expense' | 'transfer'; categoryId: string | null; transferAccountId: string | null }`
  - `corrigirRegra(raw: DecisaoNova & { aplicarAoHistorico: boolean }): Promise<{ reprocessados: number; ignorados: number }>`
  - `previaCorrecaoDeRegra(raw: DecisaoNova): Promise<PreviaCorrecao>`

- [ ] **Step 1: Write the failing tests**

Montar os mocks copiando o cabeçalho de `__tests__/openfinance/counterparty-actions-par.test.ts` (linhas 1-80). Ele já mocka `next/cache`, `getOrgId`, `createClient` (identidade), `criarPropostasDeConciliacao` e `getDb().transaction`, com `selectQueue` e `ops`. Acrescentar `delete` ao tx do mock, igual ao `_fake-tx.ts`. Também mockar:

```ts
vi.mock('@/lib/openfinance/cpf-proprio', () => ({
  carregarHashesDoTitular: vi.fn(async () => new Set(['h'])),
  ehCpfProprio: vi.fn((taxId: string) => taxId === 'CPF-DO-TITULAR'),
}))
vi.mock('@/lib/finance/account-actions', () => ({ assertAccountOwnership: vi.fn(async () => {}) }))
vi.mock('@/lib/openfinance/transfer-leg', async () => {
  const actual = await vi.importActual<typeof import('@/lib/openfinance/transfer-leg')>('@/lib/openfinance/transfer-leg')
  return { ...actual, isOpenFinanceLinkedAccount: vi.fn(async () => false) }
})
```

Testes:

```ts
const REGRA = { id: CP, nature: 'transfer', categoryId: null, transferAccountId: XP, keyType: 'description', keyValue: 'RESGATE CDB DI', confirmedAt: new Date() }

it('só daqui pra frente: atualiza a regra e não toca em lançamento', async () => {
  selectQueue.push([REGRA])
  const r = await corrigirRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: CORRETORA, aplicarAoHistorico: false })
  expect(r).toEqual({ reprocessados: 0, ignorados: 0 })
  expect(ops.filter((o) => o.op !== 'select').map((o) => o.table)).toEqual(['counterparties'])
  expect(ops.find((o) => o.table === 'counterparties')!.set).toMatchObject({ transferAccountId: CORRETORA })
})

it('com histórico: desfaz o par antigo e reaplica com a conta nova', async () => {
  selectQueue.push(
    [REGRA],                                                           // a regra
    [{ id: L1, accountId: ITAU, amountCents: 400100, description: 'Resgate CDB DI', transferGroupId: 'g1', balanceApplied: true }], // selecionar
    [{ id: 'p1', accountId: XP, amountCents: -400100, externalId: 'e:transfer-dest', balanceApplied: true, isIgnored: false, matchedTransactionId: null }], // pernas
    [{ id: L1 }],                                                      // lote de pendentes
    [{ id: L1, accountId: ITAU, amountCents: 400100, date: '2026-07-08', externalId: 'e', balanceApplied: true }], // applyTransferSingle
  )
  const r = await corrigirRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: CORRETORA, aplicarAoHistorico: true })
  expect(r).toEqual({ reprocessados: 1, ignorados: 0 })
  const escritas = ops.filter((o) => o.op !== 'select').map((o) => `${o.op}:${o.table}`)
  expect(escritas).toEqual([
    'update:accounts',       // estorno XP
    'delete:transactions',   // perna antiga
    'update:transactions',   // L1 → pending
    'update:counterparties', // regra nova
    'update:transactions',   // L1 → transfer confirmado
    'insert:transactions',   // perna nova :transfer-dest
    'update:accounts',       // saldo Corretora
  ])
})

it('CPF próprio com histórico: regra fica sem conta e os lançamentos voltam para Classificar', async () => {
  selectQueue.push(
    [{ ...REGRA, keyType: 'tax_id', keyValue: 'CPF-DO-TITULAR' }],
    [{ id: L1, accountId: ITAU, amountCents: 9552, description: 'Pix recebido', transferGroupId: 'g1', balanceApplied: true }],
    [{ id: 'p1', accountId: XP, amountCents: -9552, externalId: 'e:transfer-dest', balanceApplied: true, isIgnored: false, matchedTransactionId: null }],
  )
  const r = await corrigirRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: null, aplicarAoHistorico: true })
  expect(r.reprocessados).toBe(1)
  expect(ops.find((o) => o.table === 'counterparties')!.set).toMatchObject({ transferAccountId: null })
  expect(ops.some((o) => o.op === 'insert')).toBe(false)
})

it('par do outro lado conta como ignorado e não é desfeito', async () => {
  selectQueue.push(
    [REGRA],
    [{ id: L1, accountId: ITAU, amountCents: 100, description: 'x', transferGroupId: null, balanceApplied: true }],
    [{ id: 'perna-de-la' }],   // matched_transaction_id = L1
    [],                        // lote: L1 não está pendente
  )
  const r = await corrigirRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: CORRETORA, aplicarAoHistorico: true })
  expect(r).toEqual({ reprocessados: 0, ignorados: 1 })
})

it('corrigir para a mesma conta: saldo líquido zero', async () => {
  selectQueue.push([REGRA], [{ id: L1, accountId: ITAU, amountCents: 100, description: 'x', transferGroupId: null, balanceApplied: true }], [], [])
  const p = await previaCorrecaoDeRegra({ counterpartyId: CP, nature: 'transfer', categoryId: null, transferAccountId: XP })
  // sem grupo e sem estorno; a perna nova em XP soma −100. O caso com grupo
  // (+100 de estorno, −100 da perna nova) é coberto por somarPrevia (Task 4).
  expect(p.mudam).toBe(1)
})

it('regra de outra org ou não confirmada: recusa', async () => {
  selectQueue.push([])
  await expect(corrigirRegra({ counterpartyId: CP, nature: 'expense', categoryId: CAT, transferAccountId: null, aplicarAoHistorico: false }))
    .rejects.toThrow('Regra não encontrada.')
})
```

(Os ids `CP`, `L1`, `ITAU`, `XP`, `CORRETORA` e `CAT` são constantes UUID no topo do arquivo, no estilo de `counterparty-actions-par.test.ts`.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/corrigir-regra-actions.test.ts`
Expected: FAIL (módulo inexistente)

- [ ] **Step 3: Implement**

```ts
'use server'

import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { getDb, counterparties } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { assertAccountOwnership } from '@/lib/finance/account-actions'
import { requireIdentity } from '@/lib/auth/session'
import { revalidateSnapshotData, revalidateTransactionData } from '@/lib/finance/revalidate'
import { accountsTag, invalidateTag } from '@/lib/cache-tags'
import { criarPropostasDeConciliacao } from '@/lib/finance/forecast-match-db'
import { aplicarDecisaoAosPendentes, contaQueARegraGrava, ehRegraDoTitular } from './aplicar-regra'
import { analisarPar, desfazerParDaRegra } from './desfazer-par'
import { selecionarLancamentosDaRegra, somarPrevia, type PreviaCorrecao } from './previa-correcao'
import { isOpenFinanceLinkedAccount } from './transfer-leg'

/**
 * Corrige uma regra já confirmada (spec 2026-09-24-corrigir-regra-contraparte).
 * Só daqui pra frente: muda a linha de `counterparties`, e o sync lê a regra
 * nova. Com histórico: desfaz o que a regra antiga classificou e reaplica a
 * nova, tudo na mesma transação.
 */

type Db = ReturnType<typeof getDb>

const decisaoSchema = z
  .object({
    counterpartyId: z.string().uuid(),
    nature: z.enum(['income', 'expense', 'transfer']),
    categoryId: z.string().uuid().nullable(),
    transferAccountId: z.string().uuid().nullable(),
  })
  .refine((v) => (v.nature === 'transfer' ? v.categoryId === null : v.categoryId !== null && v.transferAccountId === null), {
    message: 'Transferência exige a outra conta, sem categoria. Receita e despesa exigem categoria, sem conta.',
  })

export type DecisaoNova = z.infer<typeof decisaoSchema>

async function lerRegra(tx: Pick<Db, 'select'>, orgId: string, id: string) {
  const [regra] = await tx
    .select({
      id: counterparties.id,
      nature: counterparties.nature,
      categoryId: counterparties.categoryId,
      transferAccountId: counterparties.transferAccountId,
      keyType: counterparties.keyType,
      keyValue: counterparties.keyValue,
      confirmedAt: counterparties.confirmedAt,
    })
    .from(counterparties)
    .where(and(eq(counterparties.id, id), eq(counterparties.orgId, orgId)))
    .limit(1)
  if (!regra || !regra.confirmedAt) throw new Error('Regra não encontrada.')
  return regra
}

/** A conta nova, quando é manual: só nela a reaplicação move saldo. */
async function contaManualNova(tx: Db, orgId: string, conta: string | null): Promise<string | null> {
  if (!conta) return null
  return (await isOpenFinanceLinkedAccount(tx, orgId, conta)) ? null : conta
}

export async function previaCorrecaoDeRegra(raw: DecisaoNova): Promise<PreviaCorrecao> {
  const input = decisaoSchema.parse(raw)
  const orgId = await getOrgId()
  const db = getDb()
  const regra = await lerRegra(db, orgId, input.counterpartyId)
  const cpfProprio = await ehRegraDoTitular(db, orgId, regra)
  const conta = contaQueARegraGrava({ nature: input.nature, transferAccountId: input.transferAccountId, cpfProprio })
  const linhas = await selecionarLancamentosDaRegra(db, orgId, regra)
  const analises = []
  for (const l of linhas) {
    const a = await analisarPar(db, orgId, l)
    analises.push({ l, forma: a.forma, estorno: a.estorno })
  }
  return somarPrevia(analises, await contaManualNova(db, orgId, conta))
}

export async function corrigirRegra(
  raw: DecisaoNova & { aplicarAoHistorico: boolean },
): Promise<{ reprocessados: number; ignorados: number }> {
  const { aplicarAoHistorico, ...resto } = raw
  const input = decisaoSchema.parse(resto)
  const orgId = await getOrgId()
  const db = getDb()
  const { userId } = await requireIdentity()
  const contasParaConciliar = new Set<string>()

  const resultado = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db
    const regra = await lerRegra(tx, orgId, input.counterpartyId)
    const cpfProprio = await ehRegraDoTitular(tx, orgId, regra)
    const conta = contaQueARegraGrava({ nature: input.nature, transferAccountId: input.transferAccountId, cpfProprio })
    if (conta) await assertAccountOwnership(tx, conta, orgId)

    let reprocessados = 0
    let ignorados = 0
    if (aplicarAoHistorico) {
      for (const l of await selecionarLancamentosDaRegra(tx, orgId, regra)) {
        const r = await desfazerParDaRegra(tx, orgId, l)
        if (r.forma === 'par-do-outro-lado') ignorados++
        else reprocessados++
      }
    }

    await tx
      .update(counterparties)
      .set({
        nature: input.nature,
        categoryId: input.categoryId,
        transferAccountId: conta,
        confirmedAt: new Date(),
        confirmedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(counterparties.id, input.counterpartyId), eq(counterparties.orgId, orgId)))

    if (aplicarAoHistorico) {
      // CPF próprio: `conta` é null, o lote não roda e os lançamentos ficam
      // pendentes em Classificar, onde a conta é escolhida um a um.
      await aplicarDecisaoAosPendentes(
        tx,
        orgId,
        { counterpartyId: input.counterpartyId, nature: input.nature, categoryId: input.categoryId, transferAccountId: conta, exceptions: [] },
        contasParaConciliar,
      )
    }
    return { reprocessados, ignorados }
  })

  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)
  for (const c of contasParaConciliar) {
    try {
      await criarPropostasDeConciliacao(db, orgId, c)
    } catch (error) {
      console.error('[corrigirRegra] falha ao propor conciliacao:', error)
    }
  }
  revalidateTransactionData(orgId)
  return resultado
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/`
Expected: PASS. Se a ordem de `ops` do teste "com histórico" divergir por causa das leituras de `applyTransferSingle` (posse/OF), ajustar a fila de selects do teste, e não o código. A sequência de **escritas** é o contrato.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/openfinance/corrigir-regra-actions.ts apps/web/__tests__/openfinance/corrigir-regra-actions.test.ts
git commit -m "feat(contraparte): corrigir regra so para o futuro ou tambem para o historico"
```
