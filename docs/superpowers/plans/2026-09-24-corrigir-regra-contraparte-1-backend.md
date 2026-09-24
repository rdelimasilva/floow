# Corrigir regra de contraparte — Plano, parte 1 (backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regra de contraparte confirmada pode ser corrigida, só para o futuro ou também para o histórico, desfazendo os pares de transferência que ela criou.

**Architecture:** O núcleo de `confirmCounterparty` sai para `aplicar-regra.ts` e passa a receber `tx`. `desfazer-par.ts` devolve um lançamento a `pending` (apagando a perna e estornando o saldo), e `corrigirRegra` compõe as duas coisas: desfaz, atualiza a regra e reaplica. A contraparte do CPF do titular nunca grava conta.

**Tech Stack:** Next.js server actions, Drizzle ORM (Postgres/Supabase), zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-corrigir-regra-contraparte-design.md`

**Parte 2:** `docs/superpowers/plans/2026-09-24-corrigir-regra-contraparte-2-tela.md` (queries, tela, extrato, script).

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

---

### Task 1: Detectar CPF do titular

**Files:**
- Create: `apps/web/lib/openfinance/cpf-proprio.ts`
- Test: `apps/web/__tests__/openfinance/cpf-proprio.test.ts`

**Interfaces:**
- Produces:
  - `carregarHashesDoTitular(db: Pick<Db, 'select'>, orgId: string): Promise<Set<string>>`
  - `ehCpfProprio(taxId: string | null | undefined, hashes: Set<string>, salt?: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { ehCpfProprio } from '@/lib/openfinance/cpf-proprio'
import { hashCpf } from '@/lib/openfinance/cpf'

const SALT = 'salt-de-teste'
const CPF = '330.764.928-02'
const hashes = new Set([hashCpf(CPF, SALT)])

describe('ehCpfProprio', () => {
  it('reconhece o CPF do titular, com ou sem máscara', () => {
    expect(ehCpfProprio(CPF, hashes, SALT)).toBe(true)
    expect(ehCpfProprio('33076492802', hashes, SALT)).toBe(true)
  })
  it('outro CPF não é próprio', () => {
    expect(ehCpfProprio('52998224725', hashes, SALT)).toBe(false)
  })
  it('CNPJ, vazio, sem conexão ou sem salt: false, sem lançar', () => {
    expect(ehCpfProprio('12.345.678/0001-95', hashes, SALT)).toBe(false)
    expect(ehCpfProprio(null, hashes, SALT)).toBe(false)
    expect(ehCpfProprio(CPF, new Set(), SALT)).toBe(false)
    expect(ehCpfProprio(CPF, hashes, '')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/cpf-proprio.test.ts`
Expected: FAIL, "Failed to resolve import '@/lib/openfinance/cpf-proprio'"

- [ ] **Step 3: Implement**

```ts
import { eq } from 'drizzle-orm'
import { getDb, openfinanceConnections } from '@floow/db'
import { hashCpf, stripCpf } from './cpf'

type Db = ReturnType<typeof getDb>

/**
 * O CPF do titular, em hash, de cada conexão Open Finance da org. É o único
 * lugar onde o floow sabe quem é o dono das contas; o CPF em claro nunca é
 * gravado (ver `cpf.ts`).
 */
export async function carregarHashesDoTitular(db: Pick<Db, 'select'>, orgId: string): Promise<Set<string>> {
  const rows = await db
    .select({ cpfHash: openfinanceConnections.cpfHash })
    .from(openfinanceConnections)
    .where(eq(openfinanceConnections.orgId, orgId))
  return new Set(rows.map((r) => r.cpfHash))
}

/**
 * A contraparte é o próprio titular? Pix para si mesmo vai para contas
 * diferentes, e por isso nunca pode virar regra de conta fixa (spec §6).
 *
 * Nunca lança: CNPJ, org sem conexão ou ambiente sem `POLP_CPF_SALT` só
 * querem dizer "não dá para saber", e aí vale o comportamento de sempre.
 */
export function ehCpfProprio(
  taxId: string | null | undefined,
  hashes: Set<string>,
  salt: string | undefined = process.env.POLP_CPF_SALT,
): boolean {
  if (!taxId || hashes.size === 0 || !salt) return false
  if (stripCpf(taxId).length !== 11) return false
  return hashes.has(hashCpf(taxId, salt))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/cpf-proprio.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # feat/corrigir-regra
git add apps/web/lib/openfinance/cpf-proprio.ts apps/web/__tests__/openfinance/cpf-proprio.test.ts
git commit -m "feat(contraparte): reconhece o CPF do titular pelo hash da conexao"
```

---

### Task 2: Extrair o núcleo de `confirmCounterparty` e tratar o CPF próprio

**Files:**
- Create: `apps/web/lib/openfinance/aplicar-regra.ts`
- Modify: `apps/web/lib/openfinance/counterparty-actions.ts` (move as linhas 73-248 e 294-359; o schema e a action ficam)
- Test: `apps/web/__tests__/openfinance/aplicar-regra.test.ts`. Os existentes (`counterparty-actions*.test.ts`, `counterparty-confirmed.test.ts`) precisam continuar verdes sem edição.

**Interfaces:**
- Consumes: `ehCpfProprio`, `carregarHashesDoTitular` (Task 1)
- Produces (em `aplicar-regra.ts`, sem `'use server'`):
  - `semParJaCriado(): SQL`
  - `applyTransferSingle(tx: Db, orgId, input: { transactionId; counterpartyId; transferAccountId }, contas: Set<string>): Promise<number>` (código atual, sem mudança)
  - `applyTransferBatch(tx: Db, orgId, input: { counterpartyId; transferAccountId; excludeIds }, contas): Promise<number>` (código atual)
  - `aplicarDecisaoAosPendentes(tx: Db, orgId: string, decisao: DecisaoDaRegra, contas: Set<string>): Promise<number>`
  - `interface DecisaoDaRegra { counterpartyId: string; nature: 'income' | 'expense' | 'transfer'; categoryId: string | null; transferAccountId: string | null; exceptions: ConfirmCounterpartyException[] }`
  - `contaQueARegraGrava(v: { nature: string; transferAccountId: string | null; cpfProprio: boolean }): string | null`. Lança `'Transferência exige a outra conta, sem categoria. Receita e despesa exigem categoria, sem conta.'` quando é transferência sem conta e sem CPF próprio.
  - `ehRegraDoTitular(tx: Pick<Db, 'select'>, orgId: string, regra: { keyType: string; keyValue: string }): Promise<boolean>`
  - `ConfirmCounterpartyException` passa a ser exportado daqui. `counterparty-actions.ts` reexporta o tipo.

- [ ] **Step 1: Write the failing test** (a parte pura)

```ts
import { describe, it, expect } from 'vitest'
import { contaQueARegraGrava } from '@/lib/openfinance/aplicar-regra'

describe('contaQueARegraGrava', () => {
  it('transferência comum grava a conta escolhida', () => {
    expect(contaQueARegraGrava({ nature: 'transfer', transferAccountId: 'c1', cpfProprio: false })).toBe('c1')
  })
  it('CPF próprio nunca grava conta, mesmo se veio uma', () => {
    expect(contaQueARegraGrava({ nature: 'transfer', transferAccountId: 'c1', cpfProprio: true })).toBeNull()
    expect(contaQueARegraGrava({ nature: 'transfer', transferAccountId: null, cpfProprio: true })).toBeNull()
  })
  it('transferência sem conta e sem CPF próprio é recusada', () => {
    expect(() => contaQueARegraGrava({ nature: 'transfer', transferAccountId: null, cpfProprio: false }))
      .toThrow('Transferência exige a outra conta')
  })
  it('receita/despesa nunca grava conta', () => {
    expect(contaQueARegraGrava({ nature: 'expense', transferAccountId: null, cpfProprio: false })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/aplicar-regra.test.ts`
Expected: FAIL (módulo inexistente)

- [ ] **Step 3: Criar `aplicar-regra.ts`**

Mover **sem alterar** `semParJaCriado`, `applyTransferSingle` e `applyTransferBatch` de `counterparty-actions.ts` (linhas 73-248, com os comentários) para o novo arquivo, com os imports que eles usam, e adicionar `export` a cada um. Mover também `exceptionSchema`, `natureMatchesDestination` e o tipo `ConfirmCounterpartyException`. Depois acrescentar:

```ts
export interface DecisaoDaRegra {
  counterpartyId: string
  nature: 'income' | 'expense' | 'transfer'
  categoryId: string | null
  transferAccountId: string | null
  exceptions: ConfirmCounterpartyException[]
}

const MSG_DESTINO = 'Transferência exige a outra conta, sem categoria. Receita e despesa exigem categoria, sem conta.'

/**
 * A conta que a contraparte grava. Pix para o próprio CPF vai cada vez para
 * uma conta, então a regra dele não grava nenhuma: `resolveCounterparty` já
 * devolve a `pending` a transferência confirmada sem conta, e cada lançamento
 * novo é decidido em Classificar (spec §6.2).
 */
export function contaQueARegraGrava(v: { nature: string; transferAccountId: string | null; cpfProprio: boolean }): string | null {
  if (v.nature !== 'transfer') return null
  if (v.cpfProprio) return null
  if (!v.transferAccountId) throw new Error(MSG_DESTINO)
  return v.transferAccountId
}

export async function ehRegraDoTitular(
  tx: Pick<Db, 'select'>,
  orgId: string,
  regra: { keyType: string; keyValue: string },
): Promise<boolean> {
  if (regra.keyType !== 'tax_id') return false
  return ehCpfProprio(regra.keyValue, await carregarHashesDoTitular(tx, orgId))
}

/**
 * Aplica a decisão aos lançamentos PENDENTES da contraparte: o lote (menos as
 * exceções) e cada exceção. Era o corpo de `confirmCounterparty`; saiu para
 * cá para `corrigirRegra` reaplicar dentro da mesma transação em que desfez.
 *
 * Transferência sem conta (CPF próprio) não tem lote: só as exceções, cada
 * uma com a sua conta, são aplicadas. O resto continua pendente.
 */
export async function aplicarDecisaoAosPendentes(
  tx: Db,
  orgId: string,
  decisao: DecisaoDaRegra,
  contasParaConciliar: Set<string>,
): Promise<number> {
  // corpo = counterparty-actions.ts:294-359 atual, com `input` → `decisao`,
  // e o ramo de transferência do lote protegido por conta:
  //   if (decisao.nature === 'transfer') {
  //     if (decisao.transferAccountId) {
  //       count += await applyTransferBatch(tx, orgId, { counterpartyId: decisao.counterpartyId,
  //         transferAccountId: decisao.transferAccountId, excludeIds: exceptionIds }, contasParaConciliar)
  //     }
  //   } else { ...UPDATE em lote igual ao atual... }
  //   for (const exception of decisao.exceptions) { ...igual ao atual... }
}
```

O corpo de `aplicarDecisaoAosPendentes` é o trecho existente de `counterparty-actions.ts:294-359`, copiado literalmente. As únicas mudanças são as duas descritas no comentário acima: `input` vira `decisao`, e o `if (decisao.transferAccountId)` envolve o lote.

- [ ] **Step 4: Reduzir `confirmCounterparty`**

Em `counterparty-actions.ts`:

1. Trocar o `.refine(natureMatchesDestination, …)` do `inputSchema` por uma regra que aceite transferência sem conta:

```ts
  .refine((v) => (v.nature === 'transfer' ? v.categoryId === null : v.categoryId !== null && v.transferAccountId === null), {
    message: 'Transferência exige a outra conta, sem categoria. Receita e despesa exigem categoria, sem conta.',
  })
```

2. Dentro da transação, ler a chave junto com o id e decidir a conta:

```ts
    const [row] = await tx
      .select({ id: counterparties.id, keyType: counterparties.keyType, keyValue: counterparties.keyValue })
      .from(counterparties)
      .where(and(eq(counterparties.id, input.counterpartyId), eq(counterparties.orgId, orgId)))
      .limit(1)
    if (!row) throw new Error('Contraparte não encontrada.')

    const cpfProprio = await ehRegraDoTitular(tx as unknown as Db, orgId, row)
    const contaDaRegra = contaQueARegraGrava({ nature: input.nature, transferAccountId: input.transferAccountId, cpfProprio })
    if (input.nature === 'transfer' && input.transferAccountId) {
      await assertAccountOwnership(tx as unknown as Db, input.transferAccountId, orgId)
    }
```

3. No UPDATE de `counterparties`, usar `transferAccountId: contaDaRegra`.
4. Trocar o bloco das linhas 294-359 por:

```ts
    const reclassifiedCount = await aplicarDecisaoAosPendentes(
      tx as unknown as Db,
      orgId,
      { counterpartyId: input.counterpartyId, nature: input.nature, categoryId: input.categoryId, transferAccountId: input.transferAccountId, exceptions: input.exceptions },
      contasParaConciliar,
    )
```

5. O portão, a invalidação de cache e as propostas de conciliação (linhas 360 em diante) ficam como estão.
6. Remover os imports que ficaram sem uso e reexportar: `export type { ConfirmCounterpartyException } from './aplicar-regra'`.

**Atenção a `'use server'`:** um arquivo `'use server'` só pode exportar funções async. A reexportação de *tipo* é permitida; a de valor não.

- [ ] **Step 5: Run all counterparty tests**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/`
Expected: PASS, incluindo `aplicar-regra.test.ts` e os testes existentes de `counterparty-actions*` sem edição. Se um teste antigo contava selects, a leitura de `keyType/keyValue` sai no **mesmo** select (nenhum select novo entra para chave `description`). Os mocks devolvem `{ id }`, então `keyType` chega `undefined` e `ehRegraDoTitular` não consulta nada.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/web/lib/openfinance/aplicar-regra.ts apps/web/lib/openfinance/counterparty-actions.ts apps/web/__tests__/openfinance/aplicar-regra.test.ts
git commit -m "refactor(contraparte): nucleo de confirmar vira aplicar-regra; CPF proprio nao grava conta"
```

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
