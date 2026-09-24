# Transferência sempre com par — Plano de implementação (parte 1 de 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda transferência Open Finance/OFX para conta própria ganha par; sem conta própria é receita/despesa.

**Architecture:** Quando o destino é conta Open Finance, a segunda perna passa a ser criada como **previsão** (`balanceApplied: false`, `externalId` com sufixo `:transfer-par`). A conciliação existente (`criarPropostasDeConciliacao` → *Confirmar previsões*) casa essa previsão com a ponta real quando ela chega. Nada de tela, fila ou tabela nova.

**Tech Stack:** Next.js (server actions), Drizzle ORM, Postgres/Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-transferencia-sempre-com-par-design.md`

**Parte 2:** `docs/superpowers/plans/2026-09-24-transferencia-sempre-com-par-parte-2.md` (Tasks 7–11).

## Global Constraints

- Nenhum arquivo pode passar de 500 linhas (CLAUDE.md). `import-actions.ts` está em 495 — a Task 11 extrai antes de mexer.
- Nenhuma tela, rota, fila, tabela ou item de menu novo.
- Textos e comentários em pt-BR.
- Rodar testes: `cd apps/web && npx vitest run <arquivo>`. Antes do merge: `pnpm typecheck` e `pnpm --filter @floow/web build` (é produção).
- Commits só com os arquivos da task (`git add <paths>`), nunca `git add -A` — há outra sessão no mesmo diretório. Conferir `git branch --show-current` antes de commitar.

## Review Focus

1. **Perna prevista nunca entra no saldo por data.** `applyDueBankTransactions` aplica qualquer linha do banco com `balance_applied = false` — a perna prevista tem `external_id` e seria aplicada. Teste na Task 2.
2. **Perna prevista nunca vira "realizado" de outra previsão.** Teste na Task 3.
3. **A ponta real não pode ser classificada duas vezes** (em Classificar e em Confirmar previsões) — geraria par cruzado. Teste na Task 7.
4. **Contraparte confirmada como transferência sem conta** (legado pré-07/09) não pode seguir confirmando lançamento novo sem par. Teste na Task 8.
5. **Sync que reenvia a ponta real já conciliada** não pode desfazer a conversão para `transfer`: o caminho de update do `persistPage` não mexe em `type`/`reviewState`, mas a categoria (`COALESCE`) não pode voltar a ser preenchida numa transferência. Guarda na Task 4.

---

### Task 1: Perna prevista — construtor e condições SQL

**Files:**
- Create: `apps/web/lib/openfinance/perna-prevista.ts`
- Modify: `apps/web/lib/openfinance/transfer-leg.ts` (acrescentar ao fim)
- Test: `apps/web/__tests__/openfinance/perna-prevista.test.ts`, `apps/web/__tests__/openfinance/transfer-leg.test.ts`

**Interfaces:**
- Produces:
  - `SUFIXO_PERNA_PREVISTA = ':transfer-par'`
  - `ehPernaPrevista(externalId: string | null | undefined): boolean`
  - `condicaoDePernaPrevista(): SQL` / `condicaoNaoEPernaPrevista(): SQL` (sobre `transactions.external_id`)
  - `buildForecastTransferLegRow(source: TransferSourceLeg, sourceAccountId: string, otherAccountId: string, transferGroupId: string): NewTransaction`
  - `montarPernaDaTransferencia(args: { source: TransferSourceLeg; sourceAccountId: string; otherAccountId: string; transferGroupId: string; destinoOpenFinance: boolean }): NewTransaction`

- [ ] **Step 1: Teste que falha — `perna-prevista.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  SUFIXO_PERNA_PREVISTA,
  ehPernaPrevista,
  condicaoDePernaPrevista,
  condicaoNaoEPernaPrevista,
} from '@/lib/openfinance/perna-prevista'

const dialect = new PgDialect()

describe('perna prevista de transferência', () => {
  it('reconhece pelo sufixo do external_id', () => {
    expect(ehPernaPrevista(`abc${SUFIXO_PERNA_PREVISTA}`)).toBe(true)
    expect(ehPernaPrevista('abc:transfer-dest')).toBe(false)
    expect(ehPernaPrevista(null)).toBe(false)
  })

  it('condição positiva filtra por LIKE no sufixo', () => {
    const q = dialect.sqlToQuery(condicaoDePernaPrevista())
    expect(q.sql).toContain('"external_id" like')
    expect(q.params).toContain(`%${SUFIXO_PERNA_PREVISTA}`)
  })

  it('condição negativa deixa passar external_id nulo', () => {
    const q = dialect.sqlToQuery(condicaoNaoEPernaPrevista())
    expect(q.sql).toContain('"external_id" is null')
    expect(q.sql).toContain('not like')
    expect(q.params).toContain(`%${SUFIXO_PERNA_PREVISTA}`)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run __tests__/openfinance/perna-prevista.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `perna-prevista.ts`**

```ts
import { sql, type SQL } from 'drizzle-orm'
import { transactions } from '@floow/db'

/**
 * Perna de transferência criada como PREVISÃO: o destino é conta Open Finance,
 * então o dinheiro de verdade chega pelo extrato daquela conta. A perna só
 * marca que ele é esperado — `balance_applied = false` para sempre — até a
 * conciliação (`criarPropostasDeConciliacao`) casá-la com a ponta real.
 *
 * O sufixo distingue esta perna da `:transfer-dest` (destino manual), que
 * também pode nascer com `balance_applied = false` quando a origem é agendada
 * e, essa sim, precisa entrar no saldo quando a data chegar.
 *
 * Ver docs/superpowers/specs/2026-09-24-transferencia-sempre-com-par-design.md §3.1
 */
export const SUFIXO_PERNA_PREVISTA = ':transfer-par'

export function ehPernaPrevista(externalId: string | null | undefined): boolean {
  return Boolean(externalId?.endsWith(SUFIXO_PERNA_PREVISTA))
}

export function condicaoDePernaPrevista(): SQL {
  return sql`${transactions.externalId} like ${`%${SUFIXO_PERNA_PREVISTA}`}`
}

export function condicaoNaoEPernaPrevista(): SQL {
  return sql`(${transactions.externalId} is null or ${transactions.externalId} not like ${`%${SUFIXO_PERNA_PREVISTA}`})`
}
```

- [ ] **Step 4: Teste que falha — acrescentar em `transfer-leg.test.ts`**

```ts
import { buildForecastTransferLegRow, montarPernaDaTransferencia } from '@/lib/openfinance/transfer-leg'

describe('buildForecastTransferLegRow', () => {
  const source = { orgId: 'org-1', amountCents: -50000, date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: true }

  it('é previsão: nunca aplicada, sufixo próprio, lembra a conta de origem', () => {
    const row = buildForecastTransferLegRow(source, 'conta-origem', 'conta-nubank', 'group-1')
    expect(row).toMatchObject({
      accountId: 'conta-nubank',
      amountCents: 50000,
      type: 'transfer',
      categoryId: null,
      transferGroupId: 'group-1',
      transferAccountId: 'conta-origem',
      externalId: 'ext-1:transfer-par',
      balanceApplied: false,
      reviewState: 'confirmed',
    })
  })
})

describe('montarPernaDaTransferencia', () => {
  const source = { orgId: 'org-1', amountCents: -50000, date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: true }

  it('destino Open Finance: perna prevista', () => {
    const row = montarPernaDaTransferencia({ source, sourceAccountId: 'a', otherAccountId: 'b', transferGroupId: 'g', destinoOpenFinance: true })
    expect(row.externalId).toBe('ext-1:transfer-par')
    expect(row.balanceApplied).toBe(false)
  })

  it('destino manual: perna real, como antes', () => {
    const row = montarPernaDaTransferencia({ source, sourceAccountId: 'a', otherAccountId: 'b', transferGroupId: 'g', destinoOpenFinance: false })
    expect(row.externalId).toBe('ext-1:transfer-dest')
    expect(row.balanceApplied).toBe(true)
  })
})
```

- [ ] **Step 5: Rodar e ver falhar** — `npx vitest run __tests__/openfinance/transfer-leg.test.ts` → FAIL (export não existe).

- [ ] **Step 6: Implementar — acrescentar ao fim de `transfer-leg.ts`**

```ts
import { SUFIXO_PERNA_PREVISTA } from './perna-prevista'

/**
 * A perna do lado de uma conta Open Finance: previsão, não lançamento. Quem
 * move o saldo daquela conta é o extrato dela; esta linha só espera a ponta
 * real para a conciliação casar. `transferAccountId` guarda a conta de ORIGEM
 * — é o que `aprovarProposta` grava na ponta real ao conciliar.
 */
export function buildForecastTransferLegRow(
  source: TransferSourceLeg,
  sourceAccountId: string,
  otherAccountId: string,
  transferGroupId: string,
): NewTransaction {
  return {
    ...buildTransferLegRow(source, otherAccountId, transferGroupId),
    externalId: `${source.externalId}${SUFIXO_PERNA_PREVISTA}`,
    balanceApplied: false,
    transferAccountId: sourceAccountId,
  }
}

/** O fork do §3.1 da spec, num lugar só: quem cria perna não decide de novo. */
export function montarPernaDaTransferencia(args: {
  source: TransferSourceLeg
  sourceAccountId: string
  otherAccountId: string
  transferGroupId: string
  destinoOpenFinance: boolean
}): NewTransaction {
  return args.destinoOpenFinance
    ? buildForecastTransferLegRow(args.source, args.sourceAccountId, args.otherAccountId, args.transferGroupId)
    : buildTransferLegRow(args.source, args.otherAccountId, args.transferGroupId)
}
```

(O `import` vai junto dos outros no topo do arquivo.)

- [ ] **Step 7: Rodar os dois testes** → PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/openfinance/perna-prevista.ts apps/web/lib/openfinance/transfer-leg.ts apps/web/__tests__/openfinance/perna-prevista.test.ts apps/web/__tests__/openfinance/transfer-leg.test.ts
git commit -m "feat(transferencia): perna prevista para destino Open Finance"
```

---

### Task 2: Perna prevista nunca entra no saldo por data

**Files:**
- Modify: `apps/web/lib/finance/apply-due.ts` (bloco `const filtro = and(...)`)
- Test: `apps/web/__tests__/finance/aplicar-vencidos-ignora-perna-prevista.test.ts`

**Interfaces:**
- Consumes: `condicaoNaoEPernaPrevista()` (Task 1)

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const wheres: SQL[] = []

function chain(): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve([]).then(r) }
  c.from = () => c
  c.limit = () => c
  c.where = (cond: SQL) => { wheres.push(cond); return c }
  return c
}

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => ({ select: () => chain() }) }
})
vi.mock('@/lib/finance/queries', () => ({ getOrgId: async () => 'org-1' }))
vi.mock('@/lib/finance/revalidate', () => ({ revalidateTransactionData: vi.fn(), revalidateSnapshotData: vi.fn() }))
vi.mock('@/lib/cache-tags', () => ({ accountsTag: vi.fn(), investmentsTag: vi.fn(), invalidateTag: vi.fn() }))

const { applyDueBankTransactions } = await import('@/lib/finance/apply-due')

describe('applyDueBankTransactions', () => {
  it('exclui a perna prevista de transferência: ela nunca entra no saldo por data', async () => {
    await applyDueBankTransactions()
    const q = new PgDialect().sqlToQuery(wheres[0])
    expect(q.sql).toContain('not like')
    expect(q.params).toContain('%:transfer-par')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL (`params` sem `%:transfer-par`).

- [ ] **Step 3: Implementar** — em `apply-due.ts`, importar e acrescentar ao `and(...)` do `filtro`, logo depois de `isNull(transactions.recurringTemplateId)`:

```ts
import { condicaoNaoEPernaPrevista } from '@/lib/openfinance/perna-prevista'
```

```ts
    // Perna prevista de transferência (destino Open Finance) também tem
    // `external_id` e nasce com `balance_applied = false`, mas não é
    // lançamento do banco: quem move o saldo daquela conta é o extrato dela.
    // Aplicá-la contaria o mesmo dinheiro duas vezes.
    condicaoNaoEPernaPrevista(),
```

- [ ] **Step 4: Rodar** → PASS. Rodar também `npx vitest run __tests__/finance` para garantir que nada mais quebrou.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/finance/apply-due.ts apps/web/__tests__/finance/aplicar-vencidos-ignora-perna-prevista.test.ts
git commit -m "fix(saldo): perna prevista de transferencia nao entra no saldo por data"
```

---

### Task 3: Conciliação enxerga a perna prevista

**Files:**
- Modify: `apps/web/lib/finance/forecast-match-db.ts:124-178` (`criarPropostasDeConciliacao`)
- Test: `apps/web/__tests__/finance/forecast-match-db.test.ts`

**Interfaces:**
- Consumes: `condicaoDePernaPrevista()`, `condicaoNaoEPernaPrevista()` (Task 1)
- Produces: `criarPropostasDeConciliacao(db, orgId, accountId)` — mesma assinatura, agora também propõe perna prevista × realizado.

- [ ] **Step 1: Teste que falha** — acrescentar no `describe('criarPropostasDeConciliacao')` (usa `wheres`, `dialect`, `selectQueue`, `mockDb` já definidos no arquivo):

```ts
  it('perna prevista de transferência entra como previsão', async () => {
    selectQueue.push([]) // nenhum previsto: basta ver a condição montada
    await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)
    const q = dialect.sqlToQuery(wheres[0])
    expect(q.sql).toContain('"recurring_template_id" is not null')
    expect(q.sql).toContain('"external_id" like')
    expect(q.params).toContain('%:transfer-par')
  })

  it('perna prevista nunca é candidata a realizado', async () => {
    selectQueue.push([PREVISTO_SALARIO])
    selectQueue.push([])
    await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)
    const q = dialect.sqlToQuery(wheres[1])
    expect(q.sql).toContain('not like')
    expect(q.params).toContain('%:transfer-par')
  })

  it('transferência de valor exato casa com a perna prevista', async () => {
    const PERNA = { id: 'perna-1', amountCents: 50000, date: new Date('2026-10-10T00:00:00Z'), description: 'Transferência recebida' }
    const PIX = { id: 'pix-1', amountCents: 50000, date: new Date('2026-10-10T00:00:00Z'), description: 'PIX RECEBIDO FULANO' }
    selectQueue.push([PERNA])
    selectQueue.push([PIX])
    const total = await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)
    expect(total).toBe(1)
    expect(inserts[0].payload).toMatchObject({ forecastTransactionId: 'perna-1', realizedTransactionId: 'pix-1' })
  })
```

- [ ] **Step 2: Rodar e ver falhar** — os dois primeiros FAIL; o terceiro já pode passar (confirma que `matchForecast` aceita valor exato sem palavra em comum).

- [ ] **Step 3: Implementar** — em `forecast-match-db.ts`:

```ts
import { and, eq, gte, isNotNull, isNull, lte, notExists, or, sql } from 'drizzle-orm'
import { condicaoDePernaPrevista, condicaoNaoEPernaPrevista } from '@/lib/openfinance/perna-prevista'
```

No `where` dos `previstos`, trocar `isNotNull(transactions.recurringTemplateId),` por:

```ts
        // Previsão é de template (recorrente) ou perna de transferência cujo
        // destino é conta Open Finance — a outra ponta chega pelo extrato.
        or(isNotNull(transactions.recurringTemplateId), condicaoDePernaPrevista()),
```

No `where` dos `realizados`, acrescentar depois de `isNull(transactions.recurringTemplateId),`:

```ts
        // A perna prevista também tem `external_id` (para dedupe), mas é
        // previsão: jamais pode cumprir outra previsão.
        condicaoNaoEPernaPrevista(),
```

Atualizar o comentário de cabeçalho da função ("de template" → "de template ou perna prevista de transferência").

- [ ] **Step 4: Rodar** `npx vitest run __tests__/finance/forecast-match-db.test.ts __tests__/finance/previsao-sem-proposta-aberta-sql.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/finance/forecast-match-db.ts apps/web/__tests__/finance/forecast-match-db.test.ts
git commit -m "feat(conciliacao): perna prevista de transferencia entra na conciliacao"
```

---

### Task 4: Sync cria perna prevista e propõe na conta de destino

**Files:**
- Modify: `apps/web/lib/openfinance/persist-page.ts` (fork em ~174-190, update em ~112, retornos)
- Modify: `apps/web/lib/openfinance/sync.ts` (loop de páginas e bloco de `criarPropostasDeConciliacao`)
- Test: `apps/web/__tests__/openfinance/sync-persist.test.ts`

**Interfaces:**
- Consumes: `montarPernaDaTransferencia` (Task 1), `criarPropostasDeConciliacao` (Task 3)
- Produces: `persistPage(...)` passa a devolver `{ imported: number; updated: number; contasComPernaPrevista: string[] }`

- [ ] **Step 1: Ajustar o teste** — em `sync-persist.test.ts`, apagar o bloco copiado `function decideTransferLeg` e o `describe('sync: fork da segunda perna de transferência')` inteiro: a decisão agora mora em `montarPernaDaTransferencia`, testada de verdade na Task 1 (o bloco testava uma cópia da lógica, não o código).

- [ ] **Step 2: Implementar em `persist-page.ts`**

Import: trocar `buildTransferLegRow` por `montarPernaDaTransferencia`.

Tipo de retorno e retornos antecipados:

```ts
): Promise<{ imported: number; updated: number; contasComPernaPrevista: string[] }> {
  if (input.normalized.length === 0) return { imported: 0, updated: 0, contasComPernaPrevista: [] }
```

Junto de `const linkedAccountCache = ...`:

```ts
  // Contas onde nasceu perna prevista nesta página: o sync propõe a
  // conciliação nelas também, porque a ponta real pode já ter chegado.
  const contasComPernaPrevista = new Set<string>()
```

Substituir o bloco do fork:

```ts
    let transferGroupId: string | null = null
    if (tx.reviewState === 'confirmed' && tx.type === 'transfer' && tx.transferAccountId) {
      let linked = linkedAccountCache.get(tx.transferAccountId)
      if (linked === undefined) {
        linked = await isOpenFinanceLinkedAccount(db, input.orgId, tx.transferAccountId)
        linkedAccountCache.set(tx.transferAccountId, linked)
      }
      transferGroupId = crypto.randomUUID()
      transferLegsToInsert.push(
        montarPernaDaTransferencia({
          source: { orgId: input.orgId, amountCents: tx.amountCents, date, externalId: tx.externalId, balanceApplied: applied },
          sourceAccountId: input.accountId,
          otherAccountId: tx.transferAccountId,
          transferGroupId,
          destinoOpenFinance: linked,
        }),
      )
      if (linked) contasComPernaPrevista.add(tx.transferAccountId)
    }
```

No caminho de update (linha da categoria), impedir que transferência ganhe categoria:

```ts
          // Categoria manual do usuário nunca é sobrescrita (mesma regra da
          // v1.1), e transferência nunca tem categoria — inclusive a ponta
          // real que a conciliação converteu em transferência.
          ...(categoryId
            ? { categoryId: sql`CASE WHEN ${transactions.type} = 'transfer' THEN ${transactions.categoryId} ELSE COALESCE(${transactions.categoryId}, ${categoryId}) END` }
            : {}),
```

Retornos finais: `if (toInsert.length === 0) return { imported: 0, updated, contasComPernaPrevista: [...contasComPernaPrevista] }` e `return { imported, updated, contasComPernaPrevista: [...contasComPernaPrevista] }`.

A soma de saldo das pernas (`sumAppliedDeltasByAccount`) já ignora `applied: false`: a perna prevista não move saldo sem mudança ali.

- [ ] **Step 3: Implementar em `sync.ts`** — antes do `for await (const page ...)`:

```ts
    const contasComPernaPrevista = new Set<string>()
```

Depois de `summary.updated += result.updated`:

```ts
      for (const conta of result.contasComPernaPrevista) contasComPernaPrevista.add(conta)
```

No `try` que chama `criarPropostasDeConciliacao` para `resource.accountId`, acrescentar logo depois dessa chamada:

```ts
      // A perna prevista nasceu em OUTRA conta. Se a ponta real de lá já
      // chegou num sync anterior, a proposta tem que nascer agora — o próximo
      // sync daquela conta só olharia o que é novo nela.
      for (const conta of contasComPernaPrevista) {
        summary.propostasDeConciliacao += await criarPropostasDeConciliacao(db, connection.orgId, conta)
      }
```

- [ ] **Step 4: Rodar** `npx vitest run __tests__/openfinance` e `cd apps/web && npx tsc --noEmit` → PASS / sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/openfinance/persist-page.ts apps/web/lib/openfinance/sync.ts apps/web/__tests__/openfinance/sync-persist.test.ts
git commit -m "feat(openfinance): sync cria perna prevista quando o destino e Open Finance"
```

---

### Task 5: Classificar cria perna prevista e propõe na hora

**Files:**
- Modify: `apps/web/lib/openfinance/counterparty-actions.ts` (`applyTransferSingle`, `applyTransferBatch`, `confirmCounterparty`)
- Test: `apps/web/__tests__/openfinance/counterparty-actions.test.ts`

**Interfaces:**
- Consumes: `montarPernaDaTransferencia` (Task 1), `criarPropostasDeConciliacao` (Task 3)
- Produces: `applyTransferSingle(tx, orgId, input, destinosPrevistos: Set<string>)` — o 4º parâmetro acumula as contas Open Finance que ganharam perna prevista.

- [ ] **Step 1: Ajustar o harness do teste** — capturar o payload dos inserts e mockar a proposta:

```ts
const insertedValues: any[] = []
```

No mock de `insert`: `return { values: (v: any) => { insertedValues.push(v); return makeChain(insertQueue.shift() ?? []) } }`. No `beforeEach`: `insertedValues.length = 0; criarPropostas.mockClear()`.

```ts
const criarPropostas = vi.fn(async () => 0)
vi.mock('@/lib/finance/forecast-match-db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/finance/forecast-match-db')>('@/lib/finance/forecast-match-db')
  return { ...actual, criarPropostasDeConciliacao: (...args: unknown[]) => criarPropostas(...args) }
})
```

`getDb` do mock precisa aceitar a chamada fora da transação: `getDb: () => ({ transaction: ..., select: () => ({ from: () => makeChain([]) }) })`.

- [ ] **Step 2: Reescrever o teste 'destino é conta Open Finance: só grava o metadado, sem segunda perna'**

```ts
    it('destino é conta Open Finance: cria a perna como previsão, sem mexer no saldo, e propõe a conciliação lá', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }])
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }])
      updateQueue.push([])
      selectQueue.push([{ id: 'tx-1' }])
      selectQueue.push([{
        id: 'tx-1', accountId: 'conta-origem', amountCents: -50000,
        date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: true,
      }])
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership
      selectQueue.push([{ id: 'resource-1' }]) // isOpenFinanceLinkedAccount: linked
      updateQueue.push([]) // update da origem
      insertQueue.push([{ id: 'tx-1-par' }]) // perna prevista entrou
      selectQueue.push([{ one: 1 }])

      const result = await confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID, nature: 'transfer', categoryId: null, transferAccountId: TRANSFER_ACCOUNT_ID,
      })

      expect(result.reclassified).toBe(1)
      expect(insertedValues[0]).toMatchObject({
        accountId: TRANSFER_ACCOUNT_ID,
        externalId: 'ext-1:transfer-par',
        balanceApplied: false,
        transferAccountId: 'conta-origem',
      })
      expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions'])
      expect(criarPropostas).toHaveBeenCalledWith(expect.anything(), ORG, TRANSFER_ACCOUNT_ID)
    })
```

Nos testes de destino manual, acrescentar `expect(criarPropostas).not.toHaveBeenCalled()`.

- [ ] **Step 3: Rodar e ver falhar** → FAIL (nenhum insert com destino Open Finance).

- [ ] **Step 4: Implementar** — em `applyTransferSingle`, novo parâmetro `destinosPrevistos: Set<string>`; trocar o trecho a partir de `const linked = ...`:

```ts
  const linked = await isOpenFinanceLinkedAccount(tx, orgId, input.transferAccountId)
  const transferGroupId = crypto.randomUUID()

  await tx
    .update(transactions)
    .set({
      type: 'transfer',
      categoryId: null,
      transferAccountId: input.transferAccountId,
      transferGroupId,
      reviewState: 'confirmed',
    })
    .where(eq(transactions.id, source.id))

  if (!source.externalId) {
    // Não deveria acontecer: só lançamento Open Finance chega pendente na
    // fila. Sem chave de dedupe, não se insere perna nenhuma.
    return 1
  }

  const perna = montarPernaDaTransferencia({
    source: { orgId, amountCents: source.amountCents, date: source.date, externalId: source.externalId, balanceApplied: source.balanceApplied },
    sourceAccountId: source.accountId,
    otherAccountId: input.transferAccountId,
    transferGroupId,
    destinoOpenFinance: linked,
  })

  const insertedLeg = await tx.insert(transactions).values(perna).onConflictDoNothing().returning({ id: transactions.id })

  // Só perna real e aplicada move o saldo. A prevista (destino Open Finance)
  // nasce com `balanceApplied: false`: o saldo de lá vem do extrato de lá.
  if (insertedLeg.length > 0 && perna.balanceApplied) {
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${-source.amountCents}` })
      .where(eq(accounts.id, input.transferAccountId))
  }

  if (linked) destinosPrevistos.add(input.transferAccountId)
  return 1
```

Manter o comentário do `.onConflictDoNothing()` que já existia. Atualizar o JSDoc da função: "segunda perna real quando o destino é manual, perna prevista quando é Open Finance". `applyTransferBatch` ganha o mesmo 4º parâmetro e o repassa.

Em `confirmCounterparty`: antes do `db.transaction`, `const destinosPrevistos = new Set<string>()`; passar nas três chamadas. Depois das invalidações de cache:

```ts
  // A ponta real pode já estar na outra conta: propõe o par agora, sem
  // esperar o próximo sync dela. Falha aqui não desfaz a confirmação — a
  // proposta nasce de novo na próxima passada daquela conta.
  for (const conta of destinosPrevistos) {
    try {
      await criarPropostasDeConciliacao(db, orgId, conta)
    } catch (error) {
      console.error('[confirmCounterparty] falha ao propor conciliacao da perna prevista:', error)
    }
  }
```

Import: `import { criarPropostasDeConciliacao } from '@/lib/finance/forecast-match-db'`; trocar `buildTransferLegRow` por `montarPernaDaTransferencia` no import de `./transfer-leg`.

- [ ] **Step 5: Rodar** `npx vitest run __tests__/openfinance/counterparty-actions.test.ts` → PASS. Conferir que o arquivo continua abaixo de 500 linhas (`wc -l`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/openfinance/counterparty-actions.ts apps/web/__tests__/openfinance/counterparty-actions.test.ts
git commit -m "feat(classificar): transferencia para conta Open Finance cria perna prevista"
```

---

### Task 6: Aprovar o par converte a ponta real em transferência

**Files:**
- Modify: `apps/web/lib/finance/forecast-match-actions.ts` (`aprovarProposta`)
- Test: `apps/web/__tests__/finance/aprovar-e-recusar-conciliacao.test.ts`

**Interfaces:**
- Consumes: `ehPernaPrevista` (Task 1)

- [ ] **Step 1: Teste que falha** — no mock de `@floow/db` do arquivo, acrescentar ao objeto `transactions`: `externalId: 'external_id', transferAccountId: 'transfer_account_id', type: 'type', categoryId: 'category_id', reviewState: 'review_state'`. Depois:

```ts
  it('perna prevista de transferência: a ponta real vira transferência confirmada, sem categoria', async () => {
    selectQueue.push([PENDENTE])
    selectQueue.push([
      { ...PREVISAO_ABERTA, externalId: 'ext-1:transfer-par', transferAccountId: 'conta-itau' },
      { ...REALIZADO_VALENDO, externalId: 'pix-nubank', transferAccountId: null },
    ])

    const { efetivada } = await aprovarProposta('prop-1')

    expect(efetivada).toBe(true)
    const escritas = ops.filter((o) => o.op === 'update:transactions').map((o) => o.payload)
    expect(escritas).toContainEqual({ matchedTransactionId: 'real-1' })
    expect(escritas).toContainEqual({
      type: 'transfer',
      categoryId: null,
      reviewState: 'confirmed',
      transferAccountId: 'conta-itau',
    })
  })

  it('previsão recorrente: a ponta real não muda de natureza', async () => {
    selectQueue.push([PENDENTE])
    selectQueue.push(PONTAS_ELEGIVEIS)
    await aprovarProposta('prop-1')
    expect(ops.filter((o) => o.op === 'update:transactions')).toHaveLength(1)
  })
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar** — no `select` das `pontas`, acrescentar `externalId: transactions.externalId` e `transferAccountId: transactions.transferAccountId`. Depois do update que grava `matchedTransactionId`:

```ts
    // Perna prevista de transferência: a ponta real é a outra metade de uma
    // transferência entre contas próprias. Vira transferência confirmada, e
    // com isso sai de Classificar — senão o usuário a classificaria de novo
    // e criaria um segundo par, cruzado.
    if (ehPernaPrevista(previsao.externalId)) {
      await tx
        .update(transactions)
        .set({
          type: 'transfer',
          categoryId: null,
          reviewState: 'confirmed',
          transferAccountId: previsao.transferAccountId,
        })
        .where(condicaoDaTransacaoDaOrg(proposta.realizedTransactionId, orgId))
    }
```

Import: `import { ehPernaPrevista } from '@/lib/openfinance/perna-prevista'`. O saldo da ponta real não muda: ela continua `balance_applied` como estava, e transferência é neutra nos relatórios.

- [ ] **Step 4: Rodar** `npx vitest run __tests__/finance/aprovar-e-recusar-conciliacao.test.ts __tests__/finance/escopo-de-org-nas-actions.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/finance/forecast-match-actions.ts apps/web/__tests__/finance/aprovar-e-recusar-conciliacao.test.ts
git commit -m "feat(conciliacao): aprovar par de transferencia converte a ponta real"
```

Continua em `2026-09-24-transferencia-sempre-com-par-parte-2.md`.
