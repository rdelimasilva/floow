# Transferência com conta de destino — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar um lançamento (ou grupo) da fila de contrapartes como "Transferência" passa a exigir uma conta de destino do próprio usuário — cria a segunda perna linkada quando o destino é uma conta manual, ou só grava o metadado quando o destino já é Open Finance (a outra ponta chega sozinha pelo sync). Vale retroativo (confirmação) e pra frente (próximas sincronizações).

**Architecture:** `counterparties` e `transactions` ganham `transfer_account_id`. Um módulo novo (`lib/openfinance/transfer-leg.ts`) concentra a decisão "a conta de destino já é Open Finance?" e a construção da segunda perna — reaproveitado por `counterparty-actions.ts` (retroativo) e `sync.ts` (pra frente), para não duplicar a lógica em dois lugares.

**Tech Stack:** Next.js 16 (App Router, server actions), Drizzle ORM, PostgreSQL (Supabase), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-07-counterparty-transfer-account-design.md`

## Global Constraints

- Só existe um tipo de transferência: entre contas do próprio usuário. Qualquer outro caso é receita ou despesa.
- `nature = 'transfer'` exige `transferAccountId` preenchido e `categoryId` nulo. `nature ∈ {income, expense}` exige o oposto.
- Destino Open Finance → só metadado, nunca segunda linha (evita duplicar a ponta que chega pelo sync daquela conta).
- Destino conta manual → segunda linha linkada por `transferGroupId`, saldo da conta de destino atualizado.
- Nunca duas pontas linkadas automaticamente quando ambas são Open Finance — cada lado se confirma independente.
- Arquivo nunca excede 500 linhas (CLAUDE.md).

---

## Task 1: Schema — `transfer_account_id`

**Files:**
- Create: `supabase/migrations/00037_counterparty_transfer_account.sql`
- Modify: `packages/db/src/schema/counterparty.ts`
- Modify: `packages/db/src/schema/finance.ts:100-182` (tabela `transactions`)
- Test: `packages/db/src/__tests__/finance-schema.test.ts`

**Interfaces:**
- Produces: `counterparties.transferAccountId: uuid | null`, `transactions.transferAccountId: uuid | null` — usados por todas as tasks seguintes.

- [ ] **Step 1: Escrever a migration**

```sql
-- =============================================================================
-- Transferência com conta de destino, cobrindo a fila de contrapartes. Ver
-- docs/superpowers/specs/2026-09-07-counterparty-transfer-account-design.md
-- =============================================================================

ALTER TABLE public.counterparties
  ADD COLUMN transfer_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

-- Necessário porque o fork "destino é Open Finance" (ver spec §4) não cria
-- segunda linha — sem esta coluna, aquele lançamento específico não teria
-- onde registrar pra qual conta foi.
ALTER TABLE public.transactions
  ADD COLUMN transfer_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

-- O CHECK de nature/category_id (migração 00035) precisa incluir
-- transfer_account_id. Resolvido em runtime porque o nome do CHECK sem
-- rótulo explícito é gerado pelo Postgres — não há garantia de qual sufixo
-- ele escolheu sem inspecionar o banco de verdade.
DO $$
DECLARE
  check_name text;
BEGIN
  SELECT conname INTO check_name
  FROM pg_constraint
  WHERE conrelid = 'public.counterparties'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%nature%category_id%';

  IF check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.counterparties DROP CONSTRAINT %I', check_name);
  END IF;
END $$;

ALTER TABLE public.counterparties
  ADD CONSTRAINT counterparties_nature_check CHECK (
    (nature = 'transfer' AND category_id IS NULL AND transfer_account_id IS NOT NULL)
    OR (nature IN ('income', 'expense') AND category_id IS NOT NULL AND transfer_account_id IS NULL)
    OR (nature IS NULL AND category_id IS NULL AND transfer_account_id IS NULL)
  );
```

- [ ] **Step 2: Atualizar o schema Drizzle de `counterparties`**

Em `packages/db/src/schema/counterparty.ts`, logo após `categoryId`:

```typescript
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    /** Pra qual conta do usuário esta contraparte transfere, por padrão. */
    transferAccountId: uuid('transfer_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
```

- [ ] **Step 3: Atualizar o schema Drizzle de `transactions`**

Em `packages/db/src/schema/finance.ts`, logo após `transferGroupId` (linha 115):

```typescript
    transferGroupId: uuid('transfer_group_id'),
    /**
     * Conta de destino de uma transferência resolvida por contraparte
     * (Nível 2 — `resolve-counterparty.ts`). Sempre gravado quando
     * `type = 'transfer'` por esse caminho, com ou sem segunda linha — ver
     * `lib/openfinance/transfer-leg.ts`. Fluxo manual não popula esta
     * coluna: já expressa o destino via `transferGroupId` + a segunda linha.
     */
    transferAccountId: uuid('transfer_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    importedAt: timestamp('imported_at', { withTimezone: true }),
```

- [ ] **Step 4: Escrever o teste de schema**

Em `packages/db/src/__tests__/finance-schema.test.ts`, adicionar ao final do arquivo:

```typescript
describe('transferência com conta de destino', () => {
  it('counterparties e transactions têm transferAccountId', () => {
    expect(getTableColumns(counterparties).transferAccountId).toBeDefined()
    expect(getTableColumns(transactions).transferAccountId).toBeDefined()
  })
})
```

- [ ] **Step 5: Rodar os testes**

Run: `cd packages/db && pnpm vitest run src/__tests__/finance-schema.test.ts`
Expected: FAIL — `transferAccountId` é `undefined` nos dois casos (schema ainda não tem a coluna).

- [ ] **Step 6: Confirmar que os Steps 2-3 fazem o teste passar**

Run: `cd packages/db && pnpm vitest run src/__tests__/finance-schema.test.ts`
Expected: PASS

- [ ] **Step 7: Typecheck do pacote `db`**

Run: `cd packages/db && pnpm typecheck` (ou `tsc --noEmit` se não houver esse script — checar `package.json`)
Expected: sem erros

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/00037_counterparty_transfer_account.sql packages/db/src/schema/counterparty.ts packages/db/src/schema/finance.ts packages/db/src/__tests__/finance-schema.test.ts
git commit -m "feat(db): transfer_account_id em counterparties e transactions"
```

---

## Task 2: Helpers compartilhados — `transfer-leg.ts`

**Files:**
- Create: `apps/web/lib/openfinance/transfer-leg.ts`
- Test: `apps/web/__tests__/openfinance/transfer-leg.test.ts`

**Interfaces:**
- Consumes: `openfinanceResources`, `NewTransaction` de `@floow/db`.
- Produces: `isOpenFinanceLinkedAccount(db, orgId, accountId): Promise<boolean>`, `buildTransferLegRow(source: TransferSourceLeg, destinationAccountId: string, transferGroupId: string): NewTransaction`, `type TransferSourceLeg = { orgId: string; amountCents: number; date: Date; externalId: string }` — usados pela Task 3 (`counterparty-actions.ts`) e Task 7 (`sync.ts`).

- [ ] **Step 1: Escrever o teste de `buildTransferLegRow` (função pura)**

Criar `apps/web/__tests__/openfinance/transfer-leg.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildTransferLegRow, isOpenFinanceLinkedAccount } from '@/lib/openfinance/transfer-leg'

describe('buildTransferLegRow', () => {
  it('inverte o valor e usa a conta de destino, confirmada, sem categoria', () => {
    const date = new Date('2026-01-15T12:00:00Z')
    const row = buildTransferLegRow(
      { orgId: 'org-1', amountCents: -50000, date, externalId: 'ext-1' },
      'conta-destino',
      'group-1',
    )

    expect(row).toMatchObject({
      orgId: 'org-1',
      accountId: 'conta-destino',
      categoryId: null,
      type: 'transfer',
      amountCents: 50000,
      date,
      transferGroupId: 'group-1',
      externalId: 'ext-1:transfer-dest',
      balanceApplied: true,
      reviewState: 'confirmed',
    })
  })

  it('externalId derivado é determinístico — mesma origem gera sempre a mesma chave', () => {
    const date = new Date('2026-01-15T12:00:00Z')
    const a = buildTransferLegRow({ orgId: 'org-1', amountCents: 1000, date, externalId: 'ext-x' }, 'conta-1', 'group-a')
    const b = buildTransferLegRow({ orgId: 'org-1', amountCents: 1000, date, externalId: 'ext-x' }, 'conta-1', 'group-b')
    expect(a.externalId).toBe(b.externalId)
  })
})

describe('isOpenFinanceLinkedAccount', () => {
  function makeDb(rows: unknown[]) {
    return {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(rows),
          }),
        }),
      })),
    } as any
  }

  it('verdadeiro quando a conta tem um recurso Open Finance vinculado', async () => {
    const db = makeDb([{ id: 'resource-1' }])
    const linked = await isOpenFinanceLinkedAccount(db, 'org-1', 'conta-1')
    expect(linked).toBe(true)
  })

  it('falso quando não há recurso vinculado (conta manual)', async () => {
    const db = makeDb([])
    const linked = await isOpenFinanceLinkedAccount(db, 'org-1', 'conta-1')
    expect(linked).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/transfer-leg.test.ts`
Expected: FAIL — `Cannot find module '@/lib/openfinance/transfer-leg'`

- [ ] **Step 3: Implementar `transfer-leg.ts`**

```typescript
import { and, eq } from 'drizzle-orm'
import { getDb, openfinanceResources, type NewTransaction } from '@floow/db'

type Db = ReturnType<typeof getDb>

/**
 * Verdadeiro quando a conta já é espelhada por um recurso Open Finance
 * (`openfinance_resources.account_id`) — nesse caso a outra ponta de uma
 * transferência chega sozinha pela sincronização daquela conta, e criar uma
 * segunda linha aqui duplicaria o lançamento.
 *
 * Ver docs/superpowers/specs/2026-09-07-counterparty-transfer-account-design.md, §4.
 */
export async function isOpenFinanceLinkedAccount(db: Db, orgId: string, accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: openfinanceResources.id })
    .from(openfinanceResources)
    .where(and(eq(openfinanceResources.orgId, orgId), eq(openfinanceResources.accountId, accountId)))
    .limit(1)

  return Boolean(row)
}

export interface TransferSourceLeg {
  orgId: string
  amountCents: number
  date: Date
  /** Sempre presente: só lançamento de origem Open Finance passa por aqui. */
  externalId: string
}

/**
 * Monta a segunda perna de uma transferência: mesma data, valor invertido,
 * na conta de destino, já confirmada — nunca passa pela fila, é gerada pela
 * própria confirmação (`counterparty-actions.ts`) ou sincronização
 * (`sync.ts`). `externalId` sempre derivado do da origem: é o que torna a
 * inserção idempotente por `(external_id, account_id)`, o mesmo índice único
 * que já protege o resto da ingestão.
 */
export function buildTransferLegRow(
  source: TransferSourceLeg,
  destinationAccountId: string,
  transferGroupId: string,
): NewTransaction {
  return {
    orgId: source.orgId,
    accountId: destinationAccountId,
    categoryId: null,
    type: 'transfer',
    amountCents: -source.amountCents,
    description: 'Transferência recebida',
    date: source.date,
    transferGroupId,
    externalId: `${source.externalId}:transfer-dest`,
    balanceApplied: true,
    reviewState: 'confirmed',
  }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/transfer-leg.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: sem erros

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/openfinance/transfer-leg.ts apps/web/__tests__/openfinance/transfer-leg.test.ts
git commit -m "feat(openfinance): helpers de segunda perna de transferência"
```

---

## Task 3: `confirmCounterparty` — conta de destino, retroativo

**Files:**
- Modify: `apps/web/lib/openfinance/counterparty-actions.ts`
- Test: `apps/web/__tests__/openfinance/counterparty-actions.test.ts`

**Interfaces:**
- Consumes: `isOpenFinanceLinkedAccount`, `buildTransferLegRow`, `TransferSourceLeg` (Task 2); `assertAccountOwnership` de `@/lib/finance/actions`.
- Produces: `ConfirmCounterpartyInput` ganha `transferAccountId: string | null` no nível do grupo e em cada exceção — consumido pela Task 5 (UI).

- [ ] **Step 1: Escrever os testes que definem o comportamento novo**

Abrir `apps/web/__tests__/openfinance/counterparty-actions.test.ts`. No topo, junto das outras constantes:

```typescript
const TRANSFER_ACCOUNT_ID = '44444444-4444-4444-4444-444444444444'
```

Estender o mock de `@floow/db` para suportar `insert` (hoje só tem `select`/`update`) — substituir o bloco `vi.mock('@floow/db', ...)` inteiro por:

```typescript
const insertQueue: unknown[][] = []

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return {
    ...actual,
    getDb: () => ({
      transaction: async (fn: (tx: unknown) => unknown) => fn({
        select: (sel: any) => {
          ops.push({ op: 'select', table: getTableName(sel?.from ?? sel) })
          return { from: (table: any) => { ops[ops.length - 1].table = getTableName(table); return makeChain(selectQueue.shift() ?? []) } }
        },
        update: (table: any) => {
          ops.push({ op: 'update', table: getTableName(table) })
          return makeChain(updateQueue.shift() ?? [])
        },
        insert: (table: any) => {
          ops.push({ op: 'insert', table: getTableName(table) })
          return { values: () => makeChain(insertQueue.shift() ?? []) }
        },
      }),
    }),
  }
})
```

E no `beforeEach`, adicionar `insertQueue.length = 0`.

Adicionar ao final do arquivo, antes do `})` que fecha o `describe('confirmCounterparty', ...)`:

```typescript
  describe('transferência com conta de destino', () => {
    it('rejeita transferência sem transferAccountId', async () => {
      await expect(
        confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'transfer', categoryId: null, transferAccountId: null }),
      ).rejects.toThrow()
    })

    it('rejeita receita/despesa com transferAccountId preenchido', async () => {
      await expect(
        confirmCounterparty({
          counterpartyId: COUNTERPARTY_ID,
          nature: 'expense',
          categoryId: CATEGORY_ID,
          transferAccountId: TRANSFER_ACCOUNT_ID,
        }),
      ).rejects.toThrow()
    })

    it('destino é conta manual: cria a segunda perna e atualiza o saldo dela', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
      updateQueue.push([]) // update de counterparties
      selectQueue.push([{ id: 'tx-1' }]) // ids pendentes do grupo (applyTransferBatch)
      selectQueue.push([{ // lookup da transação de origem (applyTransferSingle)
        id: 'tx-1', accountId: 'conta-origem', amountCents: -50000,
        date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1',
      }])
      selectQueue.push([]) // isOpenFinanceLinkedAccount: sem recurso -> conta manual
      updateQueue.push([]) // update da linha de origem (transferAccountId, transferGroupId)
      insertQueue.push([{ id: 'tx-1-dest' }]) // insert da segunda perna
      updateQueue.push([]) // update do saldo da conta de destino
      selectQueue.push([{ one: 1 }]) // ainda sobra pendência resolvível na org

      const result = await confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID,
        nature: 'transfer',
        categoryId: null,
        transferAccountId: TRANSFER_ACCOUNT_ID,
      })

      expect(result.reclassified).toBe(1)
      expect(ops.filter((o) => o.op === 'insert').map((o) => o.table)).toEqual(['transactions'])
      expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual([
        'counterparties', 'transactions', 'accounts',
      ])
    })

    it('destino é conta Open Finance: só grava o metadado, sem segunda perna', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }])
      updateQueue.push([])
      selectQueue.push([{ id: 'tx-1' }])
      selectQueue.push([{
        id: 'tx-1', accountId: 'conta-origem', amountCents: -50000,
        date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1',
      }])
      selectQueue.push([{ id: 'resource-1' }]) // isOpenFinanceLinkedAccount: achou recurso -> linked
      updateQueue.push([]) // update da linha de origem, sem segunda perna
      selectQueue.push([{ one: 1 }])

      const result = await confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID,
        nature: 'transfer',
        categoryId: null,
        transferAccountId: TRANSFER_ACCOUNT_ID,
      })

      expect(result.reclassified).toBe(1)
      expect(ops.filter((o) => o.op === 'insert')).toEqual([])
      expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions'])
    })

    it('transferência pra si mesma (conta de destino igual à do lançamento) rejeita', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }])
      updateQueue.push([])
      selectQueue.push([{ id: 'tx-1' }])
      selectQueue.push([{
        id: 'tx-1', accountId: TRANSFER_ACCOUNT_ID, amountCents: -50000,
        date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1',
      }])

      await expect(
        confirmCounterparty({
          counterpartyId: COUNTERPARTY_ID,
          nature: 'transfer',
          categoryId: null,
          transferAccountId: TRANSFER_ACCOUNT_ID,
        }),
      ).rejects.toThrow(/mesma conta/)
    })

    it('exceção com natureza transferência exige sua própria transferAccountId', async () => {
      await expect(
        confirmCounterparty({
          counterpartyId: COUNTERPARTY_ID,
          nature: 'expense',
          categoryId: CATEGORY_ID,
          exceptions: [{ transactionId: TX2_ID, nature: 'transfer', categoryId: null, transferAccountId: null }],
        }),
      ).rejects.toThrow()
    })
  })
```

- [ ] **Step 2: Rodar os testes pra ver falhar**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/counterparty-actions.test.ts`
Expected: FAIL nos 7 testes novos — schema ainda não conhece `transferAccountId`, e a lógica de fork não existe.

- [ ] **Step 3: Implementar — schema**

Em `apps/web/lib/openfinance/counterparty-actions.ts`, substituir os dois schemas:

```typescript
const exceptionSchema = z
  .object({
    transactionId: z.string().uuid(),
    nature: z.enum(['income', 'expense', 'transfer']),
    categoryId: z.string().uuid().nullable(),
    transferAccountId: z.string().uuid().nullable(),
  })
  .refine(natureMatchesDestination, {
    message: 'Transferência exige conta de destino, sem categoria. Receita e despesa exigem categoria, sem conta de destino.',
  })

const inputSchema = z
  .object({
    counterpartyId: z.string().uuid(),
    nature: z.enum(['income', 'expense', 'transfer']),
    categoryId: z.string().uuid().nullable(),
    transferAccountId: z.string().uuid().nullable(),
    exceptions: z.array(exceptionSchema).default([]),
  })
  .refine(natureMatchesDestination, {
    message: 'Transferência exige conta de destino, sem categoria. Receita e despesa exigem categoria, sem conta de destino.',
  })

function natureMatchesDestination(v: { nature: string; categoryId: string | null; transferAccountId: string | null }) {
  if (v.nature === 'transfer') return v.categoryId === null && v.transferAccountId !== null
  return v.categoryId !== null && v.transferAccountId === null
}
```

- [ ] **Step 4: Implementar — `applyTransferSingle` e `applyTransferBatch`**

Adicionar os imports no topo do arquivo:

```typescript
import { getDb, orgs, counterparties, transactions, accounts } from '@floow/db'
import { isOpenFinanceLinkedAccount, buildTransferLegRow } from './transfer-leg'
```

(`accounts` substitui a linha de import existente — `orgs, counterparties, transactions` continuam, só adiciona `accounts`.)

Adicionar, antes de `confirmCounterparty`:

```typescript
// Mesmo padrão de `resolve-counterparty.ts`/`sync.ts`: `Db` é o tipo cheio
// de `getDb()`, e o `tx` de dentro de `db.transaction(async (tx) => ...)` é
// estruturalmente compatível — sem precisar de um tipo próprio pra ele.
type Db = ReturnType<typeof getDb>

/**
 * Aplica transferência a UM lançamento pendente: natureza, sem categoria,
 * com a conta de destino. Decide o fork do §4 da spec — segunda perna
 * linkada quando o destino é conta manual, só metadado quando já é Open
 * Finance. Retorna 1 se aplicou, 0 se o lançamento não estava mais pendente
 * (corrida, ou id que não pertence a esta contraparte/org).
 */
async function applyTransferSingle(
  tx: Db,
  orgId: string,
  input: { transactionId: string; counterpartyId: string; transferAccountId: string },
): Promise<number> {
  const [source] = await tx
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
      date: transactions.date,
      externalId: transactions.externalId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, input.transactionId),
        eq(transactions.orgId, orgId),
        eq(transactions.counterpartyId, input.counterpartyId),
        eq(transactions.reviewState, 'pending'),
      ),
    )
    .limit(1)

  if (!source) return 0

  if (source.accountId === input.transferAccountId) {
    throw new Error('A conta de destino não pode ser a mesma conta do lançamento.')
  }

  const linked = await isOpenFinanceLinkedAccount(tx, orgId, input.transferAccountId)
  const transferGroupId = linked ? null : crypto.randomUUID()

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

  if (!linked && transferGroupId) {
    if (!source.externalId) {
      // Não deveria acontecer: só lançamento de origem Open Finance chega
      // pendente na fila. Cair fora sem segunda perna é o desfecho seguro
      // se acontecer — nunca inserir uma linha sem chave de dedupe.
      return 1
    }
    await tx.insert(transactions).values(
      buildTransferLegRow(
        { orgId, amountCents: source.amountCents, date: source.date, externalId: source.externalId },
        input.transferAccountId,
        transferGroupId,
      ),
    )
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${-source.amountCents}` })
      .where(eq(accounts.id, input.transferAccountId))
  }

  return 1
}

/** Mesma lógica de `applyTransferSingle`, para todos os lançamentos pendentes do grupo (menos as exceções). */
async function applyTransferBatch(
  tx: Db,
  orgId: string,
  input: { counterpartyId: string; transferAccountId: string; excludeIds: string[] },
): Promise<number> {
  const conditions = [
    eq(transactions.orgId, orgId),
    eq(transactions.counterpartyId, input.counterpartyId),
    eq(transactions.reviewState, 'pending'),
  ]
  if (input.excludeIds.length > 0) conditions.push(notInArray(transactions.id, input.excludeIds))

  const pending = await tx.select({ id: transactions.id }).from(transactions).where(and(...conditions))

  let count = 0
  for (const row of pending) {
    count += await applyTransferSingle(tx, orgId, {
      transactionId: row.id,
      counterpartyId: input.counterpartyId,
      transferAccountId: input.transferAccountId,
    })
  }
  return count
}
```

- [ ] **Step 5: Implementar — corpo de `confirmCounterparty`**

Substituir o bloco entre o UPDATE de `counterparties` e o cálculo de `stillPending`:

```typescript
    await tx
      .update(counterparties)
      .set({
        nature: input.nature,
        categoryId: input.categoryId,
        transferAccountId: input.transferAccountId,
        confirmedAt: new Date(),
        confirmedBy: session.user.id,
        updatedAt: new Date(),
      })
      .where(and(eq(counterparties.id, input.counterpartyId), eq(counterparties.orgId, orgId)))

    const exceptionIds = input.exceptions.map((e) => e.transactionId)
    let reclassifiedCount = 0

    if (input.nature === 'transfer') {
      // Mesmo cast de `assertAccountOwnership(tx as unknown as Db, ...)` em
      // `lib/finance/actions.ts`: o `tx` de dentro do callback não é
      // diretamente atribuível ao tipo cheio de `getDb()`.
      reclassifiedCount += await applyTransferBatch(tx as unknown as Db, orgId, {
        counterpartyId: input.counterpartyId,
        transferAccountId: input.transferAccountId!,
        excludeIds: exceptionIds,
      })
    } else {
      const batchConditions = [
        eq(transactions.orgId, orgId),
        eq(transactions.counterpartyId, input.counterpartyId),
        eq(transactions.reviewState, 'pending'),
      ]
      if (exceptionIds.length > 0) batchConditions.push(notInArray(transactions.id, exceptionIds))

      const rows = await tx
        .update(transactions)
        .set({ type: input.nature, categoryId: input.categoryId, transferAccountId: null, reviewState: 'confirmed' })
        .where(and(...batchConditions))
        .returning({ id: transactions.id })
      reclassifiedCount += rows.length
    }

    for (const exception of input.exceptions) {
      if (exception.nature === 'transfer') {
        reclassifiedCount += await applyTransferSingle(tx as unknown as Db, orgId, {
          transactionId: exception.transactionId,
          counterpartyId: input.counterpartyId,
          transferAccountId: exception.transferAccountId!,
        })
      } else {
        const exceptionRows = await tx
          .update(transactions)
          .set({ type: exception.nature, categoryId: exception.categoryId, transferAccountId: null, reviewState: 'confirmed' })
          .where(
            and(
              eq(transactions.orgId, orgId),
              eq(transactions.counterpartyId, input.counterpartyId),
              eq(transactions.reviewState, 'pending'),
              eq(transactions.id, exception.transactionId),
            ),
          )
          .returning({ id: transactions.id })
        reclassifiedCount += exceptionRows.length
      }
    }
```

Remover a declaração antiga `const exceptionIds = ...` e o bloco antigo do UPDATE em lote + loop de exceções que ficavam logo abaixo (foram substituídos acima). O restante da função (bloco `stillPending` em diante) não muda.

- [ ] **Step 6: Rodar os testes**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/counterparty-actions.test.ts`
Expected: PASS (todos, os 8 antigos + 7 novos = 15)

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: sem erros (a mudança de tipo de `ConfirmCounterpartyInput` — `transferAccountId` obrigatório no shape — só vai gerar erro em `counterparty-queue-client.tsx`, corrigido na Task 5)

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/openfinance/counterparty-actions.ts apps/web/__tests__/openfinance/counterparty-actions.test.ts
git commit -m "feat(openfinance): confirmCounterparty aplica transferência com conta de destino"
```

---

## Task 4: `counterparty-queries.ts` — expor a conta de destino

**Files:**
- Modify: `apps/web/lib/openfinance/counterparty-queries.ts`
- Create: `apps/web/__tests__/openfinance/counterparty-confirmed.test.ts`

**Interfaces:**
- Produces: `ConfirmedCounterparty` ganha `transferAccountId: string | null` e `transferAccountName: string | null` — consumido pela Task 5.

`apps/web/__tests__/openfinance/counterparty-queries.test.ts` já existe, mas só cobre `getReviewGateStatus`/`getReviewGateStatusSafe`, com um mock de `getDb` cuja cadeia é `select().from().where().limit()` — não suporta `.leftJoin()`/`.orderBy()`, que `getConfirmedCounterparties` usa. Como `vi.mock('@floow/db', ...)` só pode ser declarado uma vez por arquivo (hoisted), a rota mais simples é um arquivo de teste novo, dedicado, com a cadeia certa — não forçar os dois formatos dentro do mesmo mock.

- [ ] **Step 1: Escrever o teste**

Criar `apps/web/__tests__/openfinance/counterparty-confirmed.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

let rows: unknown[] = []

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return {
    ...actual,
    getDb: () => ({
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(rows),
            }),
          }),
        }),
      }),
    }),
  }
})

import { getConfirmedCounterparties } from '@/lib/openfinance/counterparty-queries'

beforeEach(() => {
  rows = []
})

describe('getConfirmedCounterparties', () => {
  it('transferência confirmada traz o nome da conta de destino, via join', async () => {
    rows = [{
      id: 'cp-1',
      displayName: 'Maraisa Ramos',
      nature: 'transfer',
      categoryId: null,
      transferAccountId: 'conta-destino',
      transferAccountName: 'Poupança',
      confirmedAt: new Date('2026-09-01T00:00:00Z'),
    }]

    const [result] = await getConfirmedCounterparties('org-1')

    expect(result.transferAccountId).toBe('conta-destino')
    expect(result.transferAccountName).toBe('Poupança')
  })

  it('receita/despesa confirmada não tem conta de destino', async () => {
    rows = [{
      id: 'cp-2',
      displayName: 'Aluguel',
      nature: 'expense',
      categoryId: 'cat-1',
      transferAccountId: null,
      transferAccountName: null,
      confirmedAt: new Date('2026-09-01T00:00:00Z'),
    }]

    const [result] = await getConfirmedCounterparties('org-1')

    expect(result.transferAccountId).toBeNull()
    expect(result.transferAccountName).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/counterparty-confirmed.test.ts`
Expected: FAIL — `getConfirmedCounterparties` ainda não seleciona `transferAccountId`/`transferAccountName`, e a query real não tem `.leftJoin()` (o mock rejeitaria a chamada por forma incompatível, ou os campos vêm `undefined`).

- [ ] **Step 4: Implementar**

Em `counterparty-queries.ts`, importar `accounts` de `@floow/db` e trocar `leftJoin`:

```typescript
import { getDb, orgs, transactions, counterparties, accounts } from '@floow/db'
```

```typescript
export interface ConfirmedCounterparty {
  id: string
  displayName: string
  nature: 'income' | 'expense' | 'transfer'
  categoryId: string | null
  transferAccountId: string | null
  transferAccountName: string | null
  confirmedAt: string
}

/** Contrapartes já confirmadas, para a aba editável da fila. */
export async function getConfirmedCounterparties(orgId: string): Promise<ConfirmedCounterparty[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: counterparties.id,
      displayName: counterparties.displayName,
      nature: counterparties.nature,
      categoryId: counterparties.categoryId,
      transferAccountId: counterparties.transferAccountId,
      transferAccountName: accounts.name,
      confirmedAt: counterparties.confirmedAt,
    })
    .from(counterparties)
    .leftJoin(accounts, eq(accounts.id, counterparties.transferAccountId))
    .where(and(eq(counterparties.orgId, orgId), sql`${counterparties.confirmedAt} is not null`))
    .orderBy(desc(counterparties.confirmedAt))

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    nature: row.nature!,
    categoryId: row.categoryId,
    transferAccountId: row.transferAccountId,
    transferAccountName: row.transferAccountName,
    confirmedAt: row.confirmedAt!.toISOString(),
  }))
}
```

- [ ] **Step 5: Rodar os testes**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/counterparty-confirmed.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && pnpm typecheck`

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/openfinance/counterparty-queries.ts apps/web/__tests__/openfinance/counterparty-confirmed.test.ts
git commit -m "feat(openfinance): getConfirmedCounterparties traz a conta de destino"
```

---

## Task 5: UI — Select de conta quando a natureza é transferência

**Files:**
- Modify: `apps/web/components/openfinance/counterparty-item-row.tsx`
- Modify: `apps/web/components/openfinance/counterparty-queue-client.tsx`
- Modify: `apps/web/components/openfinance/counterparty-queue.tsx`
- Test: `apps/web/__tests__/openfinance/counterparty-queue-client.test.tsx`

**Interfaces:**
- Consumes: `getAccounts` de `@/lib/finance/queries`; `ConfirmCounterpartyInput` (Task 3); `ConfirmedCounterparty` (Task 4).
- Produces: `CounterpartyQueueClient` ganha a prop `accountOptions: { id: string; name: string }[]`.

- [ ] **Step 1: Atualizar o teste existente pra cobrir conta de destino**

O teste existente marca o lançamento atípico como exceção "Transferência" sem conta nenhuma — com a regra nova isso é inválido (transferência sem conta de destino não passa no schema), então o teste precisa de um passo a mais (escolher a conta no Select que aparece), e a asserção final precisa do campo `transferAccountId` nos dois níveis (grupo e exceção). Não é só acrescentar — o teste existente quebra sem este ajuste.

Em `apps/web/__tests__/openfinance/counterparty-queue-client.test.tsx`, adicionar a constante nova, junto de `CATEGORY_OPTIONS`:

```typescript
const ACCOUNT_OPTIONS = [{ id: 'conta-destino', name: 'Poupança' }]
```

E substituir o teste inteiro `it('confirma o grupo com padrão + uma exceção num lançamento específico', ...)` por:

```typescript
  it('confirma o grupo com padrão + uma exceção num lançamento específico', async () => {
    render(
      React.createElement(CounterpartyQueueClient, {
        mode: 'page',
        pending: PENDING,
        confirmed: [],
        categoryOptions: CATEGORY_OPTIONS,
        accountOptions: ACCOUNT_OPTIONS,
      })
    )

    fireEvent.click(screen.getByText('ver lançamentos'))

    // padrão do grupo: despesa / aluguel
    fireEvent.click(screen.getByRole('button', { name: 'Despesa' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat-expense' } })

    // o lançamento atípico foge do padrão: vira transferência pra uma conta própria
    const outlierRow = screen.getByTestId('item-tx-outlier')
    fireEvent.click(within(outlierRow).getByText('usar classificação diferente'))
    fireEvent.click(within(outlierRow).getByRole('button', { name: 'Transferência' }))
    fireEvent.change(within(outlierRow).getByRole('combobox'), { target: { value: 'conta-destino' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    })

    expect(confirmCounterparty).toHaveBeenCalledTimes(1)
    expect(confirmCounterparty).toHaveBeenCalledWith({
      counterpartyId: 'cp-1',
      nature: 'expense',
      categoryId: 'cat-expense',
      transferAccountId: null,
      exceptions: [{ transactionId: 'tx-outlier', nature: 'transfer', categoryId: null, transferAccountId: 'conta-destino' }],
    })
  })
```

Adicionar um teste novo:

```typescript
describe('CounterpartyQueueClient — transferência com conta de destino', () => {
  it('confirma o grupo como transferência com a conta escolhida', async () => {
    render(
      React.createElement(CounterpartyQueueClient, {
        mode: 'page',
        pending: PENDING,
        confirmed: [],
        categoryOptions: CATEGORY_OPTIONS,
        accountOptions: ACCOUNT_OPTIONS,
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Transferência' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'conta-destino' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    })

    expect(confirmCounterparty).toHaveBeenCalledWith({
      counterpartyId: 'cp-1',
      nature: 'transfer',
      categoryId: null,
      transferAccountId: 'conta-destino',
      exceptions: [],
    })
  })
})
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/counterparty-queue-client.test.tsx`
Expected: FAIL — `Transferência` ainda não mostra Select nenhum, `confirmCounterparty` é chamado sem `transferAccountId`.

- [ ] **Step 3: Implementar — `counterparty-item-row.tsx`**

Trocar o tipo `Override` e o bloco de renderização condicional:

```typescript
type Override = { nature: Nature; categoryId: string | null; transferAccountId: string | null }
type AccountOption = { id: string; name: string }

interface Props {
  item: PendingGroupItem
  override: Override | undefined
  categoryOptions: CategoryOption[]
  accountOptions: AccountOption[]
  onStartOverride: () => void
  onSetOverride: (patch: Partial<Override>) => void
  onClearOverride: () => void
}
```

E, no corpo, substituir o bloco `{override.nature !== 'transfer' && (<Select categoria...>)}` por:

```tsx
          {override.nature === 'transfer' ? (
            <Select value={override.transferAccountId ?? undefined} onValueChange={(value) => onSetOverride({ transferAccountId: value })}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Conta de destino" />
              </SelectTrigger>
              <SelectContent>
                {accountOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={override.categoryId ?? undefined} onValueChange={(value) => onSetOverride({ categoryId: value })}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                {categoriesForOverride.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
```

- [ ] **Step 4: Implementar — `counterparty-queue-client.tsx`**

Trocar `CategoryOption` (mantém) e adicionar:

```typescript
type AccountOption = { id: string; name: string }

interface Props {
  mode: 'blocking' | 'page'
  pending: PendingGroup[]
  confirmed: ConfirmedCounterparty[]
  categoryOptions: CategoryOption[]
  accountOptions: AccountOption[]
}
```

Trocar o tipo de `drafts` e `itemOverrides` (adicionar `transferAccountId`):

```typescript
  const [drafts, setDrafts] = useState<Record<string, { nature: Nature | null; categoryId: string | null; transferAccountId: string | null }>>({})
  ...
  const [itemOverrides, setItemOverrides] = useState<Record<string, { nature: Nature; categoryId: string | null; transferAccountId: string | null }>>({})

  function draftFor(id: string) {
    return drafts[id] ?? { nature: null, categoryId: null, transferAccountId: null }
  }

  function setDraft(id: string, patch: Partial<{ nature: Nature | null; categoryId: string | null; transferAccountId: string | null }>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...draftFor(id), ...patch } }))
  }

  function startOverride(itemId: string, groupDraft: { nature: Nature | null; categoryId: string | null; transferAccountId: string | null }) {
    setItemOverrides((prev) => ({
      ...prev,
      [itemId]: { nature: groupDraft.nature ?? 'expense', categoryId: groupDraft.categoryId, transferAccountId: groupDraft.transferAccountId },
    }))
  }

  function setItemOverride(itemId: string, patch: Partial<{ nature: Nature; categoryId: string | null; transferAccountId: string | null }>) {
    setItemOverrides((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }) as typeof prev)
  }
```

Trocar o botão "Despesa/Receita/Transferência" pra zerar `transferAccountId` junto (não só `categoryId`) ao trocar de natureza:

```tsx
                      onClick={() => setDraft(group.counterpartyId, { nature, categoryId: null, transferAccountId: null })}
```

Trocar o bloco de validação e montagem de payload em `confirm()`:

```typescript
  async function confirm(group: PendingGroup) {
    const draft = draftFor(group.counterpartyId)
    if (!draft.nature) {
      toast('Escolha se é receita, despesa ou transferência.', 'error')
      return
    }
    if (draft.nature === 'transfer' && !draft.transferAccountId) {
      toast('Escolha a conta de destino.', 'error')
      return
    }
    if (draft.nature !== 'transfer' && !draft.categoryId) {
      toast('Escolha uma categoria.', 'error')
      return
    }

    const exceptions: { transactionId: string; nature: Nature; categoryId: string | null; transferAccountId: string | null }[] = []
    for (const item of group.items) {
      const override = itemOverrides[item.id]
      if (!override) continue
      if (override.nature === 'transfer' && !override.transferAccountId) {
        toast('Escolha a conta de destino da exceção marcada.', 'error')
        return
      }
      if (override.nature !== 'transfer' && !override.categoryId) {
        toast('Escolha uma categoria para a exceção marcada.', 'error')
        return
      }
      exceptions.push({
        transactionId: item.id,
        nature: override.nature,
        categoryId: override.nature === 'transfer' ? null : override.categoryId,
        transferAccountId: override.nature === 'transfer' ? override.transferAccountId : null,
      })
    }

    setSavingId(group.counterpartyId)
    try {
      const { reclassified } = await confirmCounterparty({
        counterpartyId: group.counterpartyId,
        nature: draft.nature,
        categoryId: draft.nature === 'transfer' ? null : draft.categoryId,
        transferAccountId: draft.nature === 'transfer' ? draft.transferAccountId : null,
        exceptions,
      })
```

(o resto de `confirm()` não muda). Trocar o Select de categoria do grupo, no JSX, pra mesma lógica condicional do item (transferência mostra Select de conta, senão Select de categoria):

```tsx
                  {draft.nature === 'transfer' && (
                    <Select
                      value={draft.transferAccountId ?? undefined}
                      onValueChange={(value) => setDraft(group.counterpartyId, { transferAccountId: value })}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Conta de destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {accountOptions.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {draft.nature && draft.nature !== 'transfer' && (
                    <Select
                      value={draft.categoryId ?? undefined}
                      onValueChange={(value) => setDraft(group.counterpartyId, { categoryId: value })}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoriesForNature.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
```

E passar `accountOptions={accountOptions}` pro `<ItemRow ... />` já existente, e atualizar a assinatura de `export function CounterpartyQueueClient({ mode, pending: initialPending, confirmed, categoryOptions, accountOptions }: Props)`.

Por fim, no bloco "Já confirmadas", mostrar a conta de destino quando a natureza é transferência:

```tsx
                <span className="text-gray-500">
                  {c.nature === 'expense' ? 'Despesa' : c.nature === 'income' ? 'Receita' : `Transferência · ${c.transferAccountName ?? '?'}`}
                </span>
```

- [ ] **Step 5: Implementar — `counterparty-queue.tsx`**

```typescript
import { getPendingCounterpartyGroups, getConfirmedCounterparties } from '@/lib/openfinance/counterparty-queries'
import { getCategories, getAccounts } from '@/lib/finance/queries'
import { toCategoryOptions } from '@/lib/finance/category-options'
import { CounterpartyQueueClient } from './counterparty-queue-client'

export async function CounterpartyQueue({ orgId, mode }: { orgId: string; mode: 'blocking' | 'page' }) {
  const [pending, confirmed, categories, accounts] = await Promise.all([
    getPendingCounterpartyGroups(orgId),
    mode === 'page' ? getConfirmedCounterparties(orgId) : Promise.resolve([]),
    getCategories(orgId),
    getAccounts(orgId),
  ])

  const categoryOptions = toCategoryOptions(
    categories.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })),
  )
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }))

  return (
    <CounterpartyQueueClient
      mode={mode}
      pending={pending}
      confirmed={confirmed}
      categoryOptions={categoryOptions}
      accountOptions={accountOptions}
    />
  )
}
```

- [ ] **Step 6: Rodar os testes**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/counterparty-queue-client.test.tsx`
Expected: PASS (2 testes)

- [ ] **Step 7: Rodar a suíte inteira e o typecheck**

Run: `cd apps/web && pnpm vitest run && pnpm typecheck`
Expected: tudo verde

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/openfinance/counterparty-item-row.tsx apps/web/components/openfinance/counterparty-queue-client.tsx apps/web/components/openfinance/counterparty-queue.tsx apps/web/__tests__/openfinance/counterparty-queue-client.test.tsx
git commit -m "feat(openfinance): UI pede conta de destino quando a natureza é transferência"
```

---

## Task 6: `resolve-counterparty.ts` — carregar a conta de destino

**Files:**
- Modify: `apps/web/lib/openfinance/resolve-counterparty.ts`
- Test: `apps/web/__tests__/openfinance/resolve-counterparty.test.ts`

**Interfaces:**
- Produces: `CounterpartyRecord.transferAccountId: string | null`, `ResolvedTransaction.transferAccountId: string | null` — consumido pela Task 7.

- [ ] **Step 1: Escrever o teste**

Adicionar ao `describe('resolveCounterparty', ...)` existente:

```typescript
  it('contraparte confirmada como transferência traz a conta de destino', async () => {
    const db = makeDb()
    const index = new Map<string, CounterpartyRecord>()
    const tx = normalizedTx({ counterpartyTaxId: '999' })
    index.set('tax_id 999 out ', {
      id: 'cp-1',
      keyType: 'tax_id',
      keyValue: '999',
      direction: 'out',
      accountId: null,
      nature: 'transfer',
      categoryId: null,
      transferAccountId: 'conta-destino',
      confirmedAt: new Date(),
    })

    const resolved = await resolveCounterparty(db, ORG, CONTA, tx, index)

    expect(resolved.transferAccountId).toBe('conta-destino')
  })

  it('contraparte pendente não carrega conta de destino nenhuma', async () => {
    const db = makeDb()
    insertReturns = [{
      id: 'cp-novo', keyType: 'tax_id', keyValue: '111', direction: 'out',
      accountId: null, nature: null, categoryId: null, transferAccountId: null, confirmedAt: null,
    }]
    const index = new Map<string, CounterpartyRecord>()
    const tx = normalizedTx({ counterpartyTaxId: '111' })

    const resolved = await resolveCounterparty(db, ORG, CONTA, tx, index)

    expect(resolved.transferAccountId).toBeNull()
  })
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/resolve-counterparty.test.ts`
Expected: FAIL — `resolved.transferAccountId` é `undefined`, não `'conta-destino'`/`null`.

- [ ] **Step 3: Implementar**

Em `resolve-counterparty.ts`:

```typescript
export interface CounterpartyRecord {
  id: string
  keyType: 'tax_id' | 'description'
  keyValue: string
  direction: 'in' | 'out'
  accountId: string | null
  nature: 'income' | 'expense' | 'transfer' | null
  categoryId: string | null
  transferAccountId: string | null
  confirmedAt: Date | null
}

export interface ResolvedTransaction extends NormalizedPolpTransaction {
  reviewState: 'confirmed' | 'pending'
  counterpartyId: string | null
  categoryId: string | null
  /** Autoritativa só quando `type === 'transfer'` e confirmada — ver `transfer-leg.ts`. */
  transferAccountId: string | null
}
```

Em `loadCounterpartyIndex`, incluir o campo ao montar `record`:

```typescript
    const record: CounterpartyRecord = {
      id: row.id,
      keyType: row.keyType,
      keyValue: row.keyValue,
      direction: row.direction,
      accountId: row.accountId,
      nature: row.nature,
      categoryId: row.categoryId,
      transferAccountId: row.transferAccountId,
      confirmedAt: row.confirmedAt,
    }
```

Em `resolveCounterparty`, os quatro `return` que hoje montam `ResolvedTransaction` ganham `transferAccountId`:

```typescript
  if (tx.natureConfirmed) {
    return { ...tx, reviewState: 'confirmed', counterpartyId: null, categoryId: null, transferAccountId: null }
  }

  const key = counterpartyKeyFor(tx, accountId)
  if (!key) {
    return { ...tx, reviewState: 'pending', counterpartyId: null, categoryId: null, transferAccountId: null }
  }
```

E, mais abaixo, nos dois pontos que criam `record` a partir de `insertedRow`/`existing` (a criação de contraparte nova), incluir `transferAccountId: insertedRow.transferAccountId` / `transferAccountId: existing.transferAccountId` respectivamente — nasce sempre `null` (contraparte nova nunca tem regra ainda), mas mantém o objeto com o mesmo shape de `CounterpartyRecord` em todo lugar que o monta.

No fallback "não deveria acontecer":

```typescript
  if (!record) {
    return { ...tx, reviewState: 'pending', counterpartyId: null, categoryId: null, transferAccountId: null }
  }
```

No caminho confirmado:

```typescript
  if (record.confirmedAt) {
    return {
      ...tx,
      type: record.nature ?? tx.type,
      reviewState: 'confirmed',
      counterpartyId: record.id,
      categoryId: record.categoryId,
      transferAccountId: record.nature === 'transfer' ? record.transferAccountId : null,
    }
  }

  return { ...tx, reviewState: 'pending', counterpartyId: record.id, categoryId: null, transferAccountId: null }
```

- [ ] **Step 4: Rodar os testes**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/resolve-counterparty.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/openfinance/resolve-counterparty.ts apps/web/__tests__/openfinance/resolve-counterparty.test.ts
git commit -m "feat(openfinance): resolveCounterparty carrega a conta de destino"
```

---

## Task 7: `sync.ts` — segunda perna na ingestão

**Files:**
- Modify: `apps/web/lib/openfinance/sync.ts`
- Test: `apps/web/__tests__/openfinance/sync-persist.test.ts`

**Interfaces:**
- Consumes: `isOpenFinanceLinkedAccount`, `buildTransferLegRow` (Task 2); `ResolvedTransaction.transferAccountId` (Task 6).

- [ ] **Step 1: Escrever o teste da lógica nova, extraída como função pura**

Seguindo o padrão já usado neste arquivo (extrair a regra condicional nova em vez de montar um mock de `db` gigante), adicionar ao final de `apps/web/__tests__/openfinance/sync-persist.test.ts`:

```typescript
/**
 * Mesma extração de `resolveCategoryId` acima: a decisão "esta transferência
 * cria segunda perna ou só metadado" isolada do resto de `persistPage`.
 */
function decideTransferLeg(
  tx: { type: string; reviewState: string; transferAccountId: string | null },
  destinationIsOpenFinanceLinked: boolean,
): 'no-transfer' | 'metadata-only' | 'linked-leg' {
  if (tx.type !== 'transfer' || tx.reviewState !== 'confirmed' || !tx.transferAccountId) return 'no-transfer'
  return destinationIsOpenFinanceLinked ? 'metadata-only' : 'linked-leg'
}

describe('sync: fork da segunda perna de transferência', () => {
  it('sem conta de destino, ou não confirmada, ou não é transferência: não cria nada', () => {
    expect(decideTransferLeg({ type: 'expense', reviewState: 'confirmed', transferAccountId: null }, false)).toBe('no-transfer')
    expect(decideTransferLeg({ type: 'transfer', reviewState: 'pending', transferAccountId: 'conta-1' }, false)).toBe('no-transfer')
    expect(decideTransferLeg({ type: 'transfer', reviewState: 'confirmed', transferAccountId: null }, false)).toBe('no-transfer')
  })

  it('destino Open Finance: só metadado', () => {
    expect(decideTransferLeg({ type: 'transfer', reviewState: 'confirmed', transferAccountId: 'conta-1' }, true)).toBe('metadata-only')
  })

  it('destino conta manual: cria a segunda perna linkada', () => {
    expect(decideTransferLeg({ type: 'transfer', reviewState: 'confirmed', transferAccountId: 'conta-1' }, false)).toBe('linked-leg')
  })
})
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/sync-persist.test.ts`
Expected: FAIL — `decideTransferLeg is not defined` (a função só existe no teste por enquanto, isso é esperado: primeiro prova a regra em isolado, depois copia a mesma decisão pra dentro de `persistPage`).

- [ ] **Step 3: Corrigir a falha esperada**

A função já está definida no próprio arquivo de teste (Step 1) — rodar de novo:

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/sync-persist.test.ts`
Expected: PASS (a função pura, sozinha, já passa — isso prova a regra antes de integrá-la em `persistPage`)

- [ ] **Step 4: Integrar em `sync.ts`**

Adicionar o import:

```typescript
import { isOpenFinanceLinkedAccount, buildTransferLegRow } from './transfer-leg'
```

Em `persistPage`, dentro do `for (const tx of input.normalized)`, depois de calcular `applied` e antes de `toInsert.push(...)`:

```typescript
    // Lançamento agendado ainda não aconteceu: entra para o usuário ver, mas
    // fora das somas, senão vira gasto que ninguém fez.
    const isScheduled = tx.settlement === 'scheduled'
    const applied = !isScheduled && date <= today

    let transferGroupId: string | null = null
    if (tx.reviewState === 'confirmed' && tx.type === 'transfer' && tx.transferAccountId) {
      let linked = linkedAccountCache.get(tx.transferAccountId)
      if (linked === undefined) {
        linked = await isOpenFinanceLinkedAccount(db, input.orgId, tx.transferAccountId)
        linkedAccountCache.set(tx.transferAccountId, linked)
      }
      if (!linked) {
        transferGroupId = crypto.randomUUID()
        transferLegsToInsert.push(
          buildTransferLegRow(
            { orgId: input.orgId, amountCents: tx.amountCents, date, externalId: tx.externalId },
            tx.transferAccountId,
            transferGroupId,
          ),
        )
      }
    }

    toInsert.push({
      orgId: input.orgId,
      accountId: input.accountId,
      categoryId,
      type: tx.type,
      amountCents: tx.amountCents,
      description: tx.description,
      date,
      externalId: tx.externalId,
      importedAt: new Date(),
      isAutoCategorized: categoryId !== null,
      isIgnored: isScheduled,
      balanceApplied: applied,
      categoryRef: tx.categoryRef,
      polpType: tx.polpType,
      payeeMcc: tx.payeeMcc,
      billPostDate: tx.billPostDate ? new Date(`${tx.billPostDate}T12:00:00Z`) : null,
      billForecastMonth: tx.billForecastMonth,
      installmentNumber: tx.installmentNumber,
      installmentTotal: tx.installmentTotal,
      counterpartyId: tx.counterpartyId,
      counterpartyTaxId: tx.counterpartyTaxId,
      counterpartyName: tx.counterpartyName,
      reviewState: tx.reviewState,
      transferGroupId,
      transferAccountId: tx.transferAccountId ?? null,
    })
```

Declarar as duas variáveis novas antes do `for`, junto de `toInsert`/`updated`:

```typescript
  const toInsert: (typeof transactions.$inferInsert)[] = []
  const transferLegsToInsert: (typeof transactions.$inferInsert)[] = []
  const linkedAccountCache = new Map<string, boolean>()
  let updated = 0
```

Por fim, dentro do `db.transaction(async (dbTx) => {...})`, depois do UPDATE de saldo da conta de origem e antes do `return inserted.length`:

```typescript
    if (transferLegsToInsert.length > 0) {
      const insertedLegs = await dbTx
        .insert(transactions)
        .values(transferLegsToInsert)
        .onConflictDoNothing()
        .returning({ accountId: transactions.accountId, amountCents: transactions.amountCents })

      const deltaByAccount = new Map<string, number>()
      for (const leg of insertedLegs) {
        deltaByAccount.set(leg.accountId, (deltaByAccount.get(leg.accountId) ?? 0) + leg.amountCents)
      }
      for (const [destAccountId, delta] of deltaByAccount) {
        if (delta === 0) continue
        await dbTx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${delta}` })
          .where(eq(accounts.id, destAccountId))
      }
    }

    return inserted.length
```

- [ ] **Step 5: Rodar a suíte de sync e o typecheck**

Run: `cd apps/web && pnpm vitest run __tests__/openfinance/sync-persist.test.ts && pnpm typecheck`
Expected: tudo verde. (`persistPage` continua sem teste de integração direto — mesma decisão já registrada no comentário do arquivo original: mock de `db` grande demais para valer a pena; a regra condicional nova está provada isolada, e a integração segue o mesmo padrão do resto da função, sem lógica condicional própria não coberta.)

- [ ] **Step 6: Rodar a suíte inteira**

Run: `cd apps/web && pnpm vitest run`
Expected: PASS, sem regressão em nenhum outro arquivo.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/openfinance/sync.ts apps/web/__tests__/openfinance/sync-persist.test.ts
git commit -m "feat(openfinance): sincronização cria a segunda perna de transferência"
```

---

## Task 8: Build de produção e revisão final

**Files:** nenhum (verificação)

- [ ] **Step 1: Suíte completa**

Run: `cd apps/web && pnpm vitest run && pnpm typecheck`
Expected: tudo verde

- [ ] **Step 2: Build de produção**

Run: `cd apps/web && pnpm build`
Expected: build limpo (o projeto vai direto pra `master` — rodar build antes é a prática já estabelecida)

- [ ] **Step 3: Conferir manualmente contra o spec**

Reler `docs/superpowers/specs/2026-09-07-counterparty-transfer-account-design.md` §1-9 e confirmar, um a um, que cada seção tem uma task correspondente acima (§3→Task 1, §4→Tasks 2-3, §5 retroativo→Task 3, §5 pra frente→Tasks 6-7, §6→Task 5, §7→"não faz" nada a implementar, §8→testes espalhados pelas tasks).

- [ ] **Step 4: Commit final se houver ajuste, senão pronto pra push**
