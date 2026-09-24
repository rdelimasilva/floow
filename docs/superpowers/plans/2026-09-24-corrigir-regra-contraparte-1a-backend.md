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

