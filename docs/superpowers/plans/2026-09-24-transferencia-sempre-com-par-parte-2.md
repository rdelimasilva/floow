# Transferência sempre com par — Plano de implementação (parte 2 de 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Cabeçalho, Global Constraints e Review Focus: `docs/superpowers/plans/2026-09-24-transferencia-sempre-com-par.md` (parte 1). Valem aqui também. As Tasks 1–6 já estão feitas quando esta parte começa.

**Spec:** `docs/superpowers/specs/2026-09-24-transferencia-sempre-com-par-design.md`

---

### Task 7: Ponta real com par pendente sai de Classificar

**Files:**
- Modify: `apps/web/lib/finance/forecast-match-db.ts` (nova função exportada)
- Modify: `apps/web/lib/openfinance/counterparty-queries.ts` (`getReviewGateStatus`, `contarLancamentosAClassificar`, `getPendingCounterpartyGroups`)
- Modify: `apps/web/lib/openfinance/counterparty-actions.ts` (consulta `stillPending` em `confirmCounterparty`)
- Test: `apps/web/__tests__/finance/fora-de-par-de-transferencia-sql.test.ts`

**Interfaces:**
- Consumes: `SUFIXO_PERNA_PREVISTA` (Task 1)
- Produces: `condicaoForaDeParDeTransferenciaPendente(): SQL` — verdadeira para a linha de `transactions` que NÃO é realizado de proposta pendente contra perna prevista.

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { condicaoForaDeParDeTransferenciaPendente } from '@/lib/finance/forecast-match-db'

describe('condicaoForaDeParDeTransferenciaPendente', () => {
  it('exclui o realizado com proposta pendente contra perna prevista', () => {
    const q = new PgDialect().sqlToQuery(condicaoForaDeParDeTransferenciaPendente())
    const s = q.sql.toLowerCase()
    expect(s).toContain('not exists')
    expect(s).toContain('"forecast_match_proposals"')
    expect(s).toContain("fmp.status = 'pending'")
    expect(s).toContain('fmp.realized_transaction_id = "transactions"."id"')
    expect(q.params).toContain('%:transfer-par')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL (export não existe).

- [ ] **Step 3: Implementar em `forecast-match-db.ts`**

```ts
import { SUFIXO_PERNA_PREVISTA } from '@/lib/openfinance/perna-prevista'

/**
 * Verdadeiro quando a linha de `transactions` sendo filtrada NÃO é o
 * realizado de uma proposta pendente contra perna prevista de transferência.
 *
 * Essa ponta já tem decisão esperando em Confirmar previsões. Se Classificar
 * também a mostrasse, o usuário poderia marcá-la como transferência de novo —
 * criando uma perna prevista na conta de origem, que casaria com a linha real
 * de lá: dois pares cruzados para o mesmo dinheiro.
 *
 * Aliases `fmp`/`prev` porque a subconsulta relê `transactions`; sem alias,
 * `"transactions"."id"` apontaria para a linha de dentro.
 */
export function condicaoForaDeParDeTransferenciaPendente() {
  return sql`not exists (select 1 from ${forecastMatchProposals} fmp inner join ${transactions} prev on prev.id = fmp.forecast_transaction_id where fmp.realized_transaction_id = ${transactions.id} and fmp.status = 'pending' and prev.external_id like ${`%${SUFIXO_PERNA_PREVISTA}`})`
}
```

- [ ] **Step 4: Aplicar a condição** — acrescentar `condicaoForaDeParDeTransferenciaPendente()` ao `and(...)` das quatro consultas que definem "pendente em Classificar":
  - `counterparty-queries.ts` → `getReviewGateStatus` (o `where` com `isNotNull(transactions.counterpartyId)`)
  - `counterparty-queries.ts` → `contarLancamentosAClassificar`
  - `counterparty-queries.ts` → `getPendingCounterpartyGroups` (o `where(and(eq(orgId), eq(reviewState,'pending')))`)
  - `counterparty-actions.ts` → consulta `stillPending` de `confirmCounterparty`

  Em cada uma, uma linha de comentário: `// Ponta com par de transferência pendente decide-se em Confirmar previsões.` Import: `import { condicaoForaDeParDeTransferenciaPendente } from '@/lib/finance/forecast-match-db'`.

- [ ] **Step 5: Rodar** `npx vitest run __tests__/finance/fora-de-par-de-transferencia-sql.test.ts __tests__/openfinance/counterparty-queries.test.ts __tests__/openfinance/counterparty-actions.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/finance/forecast-match-db.ts apps/web/lib/openfinance/counterparty-queries.ts apps/web/lib/openfinance/counterparty-actions.ts apps/web/__tests__/finance/fora-de-par-de-transferencia-sql.test.ts
git commit -m "fix(classificar): ponta com par de transferencia pendente nao aparece duas vezes"
```

---

### Task 8: Transferência sem conta nunca é confirmada

**Files:**
- Modify: `apps/web/lib/openfinance/resolve-counterparty.ts` (`resolveCounterparty`)
- Test: `apps/web/__tests__/openfinance/resolve-counterparty.test.ts`

**Interfaces:**
- Produces: `resolveCounterparty` — mesma assinatura. Nível 1 com `type: 'transfer'` passa pela contraparte; contraparte confirmada como `transfer` sem `transferAccountId` devolve `reviewState: 'pending'`.

- [ ] **Step 1: Ajustar testes existentes**
  - `'Nível 1 confirmado não toca o índice nem o banco'`: trocar `type: 'transfer'` por `type: 'expense'` (o caso continua valendo para despesa/receita).
  - `'contraparte já confirmada no índice aplica natureza e categoria'`: no registro do índice, `transferAccountId: 'conta-destino'`.

- [ ] **Step 2: Testes que falham**

```ts
  it('Nível 1 transferência passa pela contraparte e fica pendente até ter conta', async () => {
    const db = makeDb()
    insertReturns = [{
      id: 'cp-aplic', keyType: 'description', keyValue: 'APLICACAO CDB DI', direction: 'out',
      accountId: CONTA, nature: null, categoryId: null, transferAccountId: null, confirmedAt: null,
    }]
    const index = new Map<string, CounterpartyRecord>()
    const tx = normalizedTx({ natureConfirmed: true, type: 'transfer', description: 'APLICACAO CDB DI' })

    const resolved = await resolveCounterparty(db, ORG, CONTA, tx, index)

    expect(resolved.reviewState).toBe('pending')
    expect(resolved.counterpartyId).toBe('cp-aplic')
    expect(resolved.type).toBe('transfer')
  })

  it('contraparte confirmada como transferência SEM conta não confirma o lançamento', async () => {
    const db = makeDb()
    const index = new Map<string, CounterpartyRecord>()
    index.set('tax_id 999 out ', {
      id: 'cp-legado', keyType: 'tax_id', keyValue: '999', direction: 'out', accountId: null,
      nature: 'transfer', categoryId: null, transferAccountId: null, confirmedAt: new Date(),
    })

    const resolved = await resolveCounterparty(db, ORG, CONTA, normalizedTx({ counterpartyTaxId: '999' }), index)

    expect(resolved.reviewState).toBe('pending')
    expect(resolved.counterpartyId).toBe('cp-legado')
    expect(resolved.transferAccountId).toBeNull()
  })

  it('Nível 1 transferência com contraparte confirmada e conta: confirma com a conta', async () => {
    const db = makeDb()
    const index = new Map<string, CounterpartyRecord>()
    index.set(`description APLICACAO CDB DI out ${CONTA}`, {
      id: 'cp-aplic', keyType: 'description', keyValue: 'APLICACAO CDB DI', direction: 'out', accountId: CONTA,
      nature: 'transfer', categoryId: null, transferAccountId: 'conta-corretora', confirmedAt: new Date(),
    })
    const tx = normalizedTx({ natureConfirmed: true, type: 'transfer', description: 'APLICACAO CDB DI' })

    const resolved = await resolveCounterparty(db, ORG, CONTA, tx, index)

    expect(resolved.reviewState).toBe('confirmed')
    expect(resolved.transferAccountId).toBe('conta-corretora')
  })
```

(A chave do índice segue `compositeKey`: `[keyType, keyValue, direction, accountId ?? ''].join(' ')`.)

- [ ] **Step 3: Rodar e ver falhar** → os três novos FAIL.

- [ ] **Step 4: Implementar** — em `resolveCounterparty`:

```ts
  // Nível 1 decide sozinho receita e despesa. Transferência não: o sinal do
  // BCB diz que o dinheiro mudou de lugar, mas não para qual conta própria —
  // e transferência sem conta não tem par. Passa pela contraparte, que
  // lembra a conta da primeira vez em diante.
  if (tx.natureConfirmed && tx.type !== 'transfer') {
    return { ...tx, reviewState: 'confirmed', counterpartyId: null, categoryId: null, transferAccountId: null }
  }
```

E no ramo `if (record.confirmedAt)`, antes do `return` confirmado:

```ts
    // Contraparte confirmada como transferência antes de 07/09 não tem conta.
    // Aplicá-la confirmaria transferência sem par: volta para Classificar,
    // que agora exige a conta.
    if (record.nature === 'transfer' && !record.transferAccountId) {
      return { ...tx, type: 'transfer', reviewState: 'pending', counterpartyId: record.id, categoryId: null, transferAccountId: null }
    }
```

- [ ] **Step 5: Rodar** `npx vitest run __tests__/openfinance/resolve-counterparty.test.ts __tests__/openfinance/counterparty-confirmed.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/openfinance/resolve-counterparty.ts apps/web/__tests__/openfinance/resolve-counterparty.test.ts
git commit -m "feat(openfinance): transferencia sem conta passa por Classificar"
```

---

### Task 9: Classificar já abre em Transferência quando o banco disse que é

**Files:**
- Modify: `apps/web/lib/openfinance/counterparty-queries.ts` (`PendingGroupItem`, `getPendingCounterpartyGroups`)
- Modify: `apps/web/components/openfinance/counterparty-queue-client.tsx` (`draftFor`)
- Test: `apps/web/__tests__/openfinance/counterparty-queue-client.test.tsx`

**Interfaces:**
- Produces: `PendingGroupItem.type?: 'income' | 'expense' | 'transfer'` (opcional: fixtures antigas continuam válidas).

- [ ] **Step 1: Teste que falha** — acrescentar ao arquivo:

```ts
describe('CounterpartyQueueClient — natureza já decidida pelo banco', () => {
  it('grupo só de transferências abre com Transferência escolhida, pedindo a conta', async () => {
    const pending = [{
      counterpartyId: 'cp-aplic', displayName: 'APLICACAO CDB DI', keyType: 'description' as const,
      count: 1, totalCents: -100_000,
      items: [{ id: 'tx-a', date: '2026-01-05', description: 'APLICACAO CDB DI', amountCents: -100_000, accountId: 'conta-origem', type: 'transfer' as const }],
    }]
    render(React.createElement(CounterpartyQueueClient, {
      mode: 'page', pending, confirmed: [], categoryOptions: CATEGORY_OPTIONS, accountOptions: ACCOUNT_OPTIONS,
    }))

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'conta-destino' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar' })) })

    expect(confirmCounterparty).toHaveBeenCalledWith(expect.objectContaining({
      counterpartyId: 'cp-aplic', nature: 'transfer', categoryId: null, transferAccountId: 'conta-destino',
    }))
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL (sem natureza escolhida, não há combobox de conta).

- [ ] **Step 3: Implementar**

`counterparty-queries.ts` — em `PendingGroupItem`:

```ts
  /**
   * Natureza com que o lançamento está gravado. Quando o próprio banco já
   * disse que é transferência (aplicação, resgate, fatura), a fila abre com
   * Transferência escolhida e só pede a conta.
   */
  type?: 'income' | 'expense' | 'transfer'
```

No `select` de `getPendingCounterpartyGroups`, `type: transactions.type`; no `group.items.push`, `type: row.type`.

`counterparty-queue-client.tsx` — `draftFor`:

```ts
  function draftFor(id: string) {
    if (drafts[id]) return drafts[id]
    // O banco já disse que é transferência em todos os lançamentos do grupo:
    // abre em Transferência, falta só a conta.
    const grupo = pending.find((g) => g.counterpartyId === id)
    const soTransferencia = Boolean(grupo?.items.length) && grupo!.items.every((i) => i.type === 'transfer')
    return { nature: soTransferencia ? ('transfer' as Nature) : null, categoryId: null, transferAccountId: null }
  }
```

- [ ] **Step 4: Rodar** `npx vitest run __tests__/openfinance/counterparty-queue-client.test.tsx __tests__/openfinance/counterparty-queries.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/openfinance/counterparty-queries.ts apps/web/components/openfinance/counterparty-queue-client.tsx apps/web/__tests__/openfinance/counterparty-queue-client.test.tsx
git commit -m "feat(classificar): abre em Transferencia quando o banco ja disse"
```

---

### Task 10: Legado — o backfill existente reclassifica, e as pernas faltantes nascem

**Files:**
- Create: `apps/web/lib/openfinance/pernas-faltantes.ts`
- Modify: `apps/web/lib/openfinance/backfill.ts` (`where` do update)
- Modify: `apps/web/app/api/admin/backfill-counterparties/route.ts`
- Test: `apps/web/__tests__/openfinance/pernas-faltantes.test.ts`

**Interfaces:**
- Consumes: `buildForecastTransferLegRow`, `isOpenFinanceLinkedAccount` (Task 1 / existente), `condicaoNaoEPernaPrevista` (Task 1), `criarPropostasDeConciliacao`, `condicaoDeRealizadoSemVinculo` (existente em `forecast-match-db.ts:97`)
- Produces: `criarPernasPrevistasFaltantes(db: Db, orgId: string): Promise<{ criadas: number }>`

Com as Tasks 8 e 9, reclassificar o legado é rodar de novo o backfill que já existe (`POST /api/admin/backfill-counterparties`): Nível 1 e contraparte-transferência-sem-conta voltam pendentes para Classificar. Falta (a) o backfill não reverter a ponta real já conciliada e (b) criar a perna prevista das transferências confirmadas entre 07/09 e hoje com destino Open Finance, que só têm o metadado.

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect, vi } from 'vitest'

const inserts: any[] = []
const updates: any[] = []
const selectQueue: unknown[][] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'onConflictDoNothing', 'returning']) c[m] = () => c
  c.set = (p: unknown) => { updates.push(p); return c }
  return c
}

const db: any = {
  select: () => chain(selectQueue.shift() ?? []),
  update: () => chain([]),
  insert: () => ({ values: (v: unknown) => { inserts.push(v); return chain([{ id: 'nova' }]) } }),
  transaction: async (fn: (t: unknown) => unknown) => fn(db),
}

const propor = vi.fn(async () => 0)
vi.mock('@/lib/finance/forecast-match-db', () => ({ criarPropostasDeConciliacao: (...a: unknown[]) => propor(...a) }))

const { criarPernasPrevistasFaltantes } = await import('@/lib/openfinance/pernas-faltantes')

describe('criarPernasPrevistasFaltantes', () => {
  it('transferência confirmada só com metadado e destino Open Finance ganha perna prevista e proposta', async () => {
    selectQueue.push([{
      id: 'tx-1', accountId: 'itau', amountCents: -50000, date: new Date('2026-09-10T12:00:00Z'),
      externalId: 'ext-1', transferAccountId: 'nubank', balanceApplied: true,
    }])
    selectQueue.push([{ id: 'recurso-nubank' }]) // isOpenFinanceLinkedAccount: linked

    const { criadas } = await criarPernasPrevistasFaltantes(db, 'org-1')

    expect(criadas).toBe(1)
    expect(inserts[0]).toMatchObject({ accountId: 'nubank', externalId: 'ext-1:transfer-par', balanceApplied: false, transferAccountId: 'itau' })
    expect(updates[0]).toMatchObject({ transferGroupId: inserts[0].transferGroupId })
    expect(propor).toHaveBeenCalledWith(db, 'org-1', 'nubank')
  })

  it('destino que não é mais Open Finance fica como está', async () => {
    selectQueue.push([{
      id: 'tx-2', accountId: 'itau', amountCents: -50000, date: new Date('2026-09-10T12:00:00Z'),
      externalId: 'ext-2', transferAccountId: 'manual', balanceApplied: true,
    }])
    selectQueue.push([]) // não linked

    const { criadas } = await criarPernasPrevistasFaltantes(db, 'org-1')
    expect(criadas).toBe(0)
  })
})
```

(Limpar `inserts`, `updates`, `selectQueue` e `propor` num `beforeEach`.)

- [ ] **Step 2: Rodar e ver falhar** → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `pernas-faltantes.ts`**

```ts
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { getDb, transactions } from '@floow/db'
import { criarPropostasDeConciliacao } from '@/lib/finance/forecast-match-db'
import { buildForecastTransferLegRow, isOpenFinanceLinkedAccount } from './transfer-leg'
import { condicaoNaoEPernaPrevista } from './perna-prevista'

type Db = ReturnType<typeof getDb>

/**
 * Transferências confirmadas entre 07/09 e a spec de 24/09 com destino Open
 * Finance: só gravaram `transfer_account_id`, sem perna. Cria a perna prevista
 * de cada uma e propõe a conciliação na conta de destino — daí em diante, é o
 * mesmo caminho de uma transferência nova.
 *
 * Roda junto do backfill (`/api/admin/backfill-counterparties`), uma vez.
 * Idempotente: quem ganhou perna ganhou `transfer_group_id` e sai do filtro.
 */
export async function criarPernasPrevistasFaltantes(db: Db, orgId: string): Promise<{ criadas: number }> {
  const semPar = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
      date: transactions.date,
      externalId: transactions.externalId,
      transferAccountId: transactions.transferAccountId,
      balanceApplied: transactions.balanceApplied,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.type, 'transfer'),
        eq(transactions.reviewState, 'confirmed'),
        isNotNull(transactions.transferAccountId),
        isNull(transactions.transferGroupId),
        isNotNull(transactions.externalId),
        condicaoNaoEPernaPrevista(),
      ),
    )

  const destinos = new Set<string>()
  let criadas = 0

  for (const linha of semPar) {
    const destino = linha.transferAccountId!
    if (!(await isOpenFinanceLinkedAccount(db, orgId, destino))) continue

    const transferGroupId = crypto.randomUUID()
    await db.transaction(async (tx) => {
      await tx.update(transactions).set({ transferGroupId }).where(and(eq(transactions.id, linha.id), eq(transactions.orgId, orgId)))
      await tx
        .insert(transactions)
        .values(
          buildForecastTransferLegRow(
            { orgId, amountCents: linha.amountCents, date: linha.date, externalId: linha.externalId!, balanceApplied: false },
            linha.accountId,
            destino,
            transferGroupId,
          ),
        )
        .onConflictDoNothing()
    })
    destinos.add(destino)
    criadas++
  }

  for (const conta of destinos) await criarPropostasDeConciliacao(db, orgId, conta)

  return { criadas }
}
```

- [ ] **Step 4: Guarda no backfill** — em `backfill.ts`, no `where` do update, acrescentar:

```ts
                // Ponta real já conciliada com perna prevista, ou origem que
                // já tem par: a decisão foi tomada, o backfill não a desfaz.
                condicaoDeRealizadoSemVinculo(),
                isNull(transactions.transferGroupId),
```

Imports: `isNull` de `drizzle-orm`; `condicaoDeRealizadoSemVinculo` de `@/lib/finance/forecast-match-db`.

- [ ] **Step 5: Rota** — em `route.ts`, depois de `backfillCounterparties(orgId)`:

```ts
    const pernas = await criarPernasPrevistasFaltantes(getDb(), orgId)
```

e incluir `pernasPrevistas: pernas.criadas` no `metadata` do `recordAudit` e na resposta JSON. Imports: `getDb` de `@floow/db`, `criarPernasPrevistasFaltantes` de `@/lib/openfinance/pernas-faltantes`.

- [ ] **Step 6: Rodar** `npx vitest run __tests__/openfinance` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/openfinance/pernas-faltantes.ts apps/web/lib/openfinance/backfill.ts apps/web/app/api/admin/backfill-counterparties/route.ts apps/web/__tests__/openfinance/pernas-faltantes.test.ts
git commit -m "feat(transferencia): legado ganha perna prevista pelo backfill existente"
```

---

### Task 11: OFX segue a mesma regra

**Files:**
- Create: `apps/web/lib/finance/import-transfer.ts`
- Modify: `apps/web/lib/finance/import-actions.ts` (bloco `// Insert transfer transactions (two legs each)`, ~439-480)
- Test: `apps/web/__tests__/finance/import-transfer.test.ts`

**Interfaces:**
- Consumes: `buildForecastTransferLegRow`, `isOpenFinanceLinkedAccount` (Task 1 / existente), `criarPropostasDeConciliacao`
- Produces: `inserirTransferenciaImportada(tx: Db, args: { orgId: string; accountId: string; destAccountId: string; amountCents: number; description: string; date: Date; externalId: string | null; importedAt: Date; categoryId: string | null }): Promise<{ destinoPrevisto: string | null }>`

`import-actions.ts` tem 495 linhas: extrair o bloco é o que permite mexer nele.

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { inserirTransferenciaImportada } from '@/lib/finance/import-transfer'

const inserts: any[] = []
const updates: string[] = []
const selectQueue: unknown[][] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'set', 'onConflictDoNothing', 'returning']) c[m] = () => c
  return c
}
const tx: any = {
  select: () => chain(selectQueue.shift() ?? []),
  insert: () => ({ values: (v: unknown) => { inserts.push(v); return chain([]) } }),
  update: (t: any) => { updates.push(getTableName(t)); return chain([]) },
}

const BASE = {
  orgId: 'org-1', accountId: 'itau', destAccountId: 'nubank', amountCents: -50000,
  description: 'TED', date: new Date('2026-09-10T12:00:00Z'), externalId: 'fitid-1',
  importedAt: new Date(), categoryId: null,
}

beforeEach(() => { inserts.length = 0; updates.length = 0; selectQueue.length = 0 })

describe('inserirTransferenciaImportada', () => {
  it('destino Open Finance: perna prevista, só o saldo da origem muda', async () => {
    selectQueue.push([{ id: 'recurso' }]) // linked
    const r = await inserirTransferenciaImportada(tx, BASE)
    expect(r.destinoPrevisto).toBe('nubank')
    expect(inserts[1]).toMatchObject({ accountId: 'nubank', externalId: 'fitid-1:transfer-par', balanceApplied: false })
    expect(updates).toEqual(['accounts'])
  })

  it('destino manual: duas pernas reais e dois saldos, como antes', async () => {
    selectQueue.push([]) // não linked
    const r = await inserirTransferenciaImportada(tx, BASE)
    expect(r.destinoPrevisto).toBeNull()
    expect(inserts[1]).toMatchObject({ accountId: 'nubank', amountCents: 50000 })
    expect(updates).toEqual(['accounts', 'accounts'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `import-transfer.ts`** — move o bloco de `import-actions.ts` sem mudar o caminho manual:

```ts
import { eq, sql } from 'drizzle-orm'
import { getDb, accounts, transactions } from '@floow/db'
import { buildForecastTransferLegRow, isOpenFinanceLinkedAccount } from '@/lib/openfinance/transfer-leg'

type Db = ReturnType<typeof getDb>

/**
 * Uma transferência marcada no import de extrato: a perna da conta importada
 * e a da outra conta própria. Destino Open Finance recebe perna PREVISTA —
 * o dinheiro real de lá chega pelo extrato de lá, e a conciliação casa os
 * dois; criar perna real duplicaria o valor (spec de 24/09, §3.6).
 */
export async function inserirTransferenciaImportada(
  tx: Db,
  args: {
    orgId: string
    accountId: string
    destAccountId: string
    amountCents: number
    description: string
    date: Date
    externalId: string | null
    importedAt: Date
    categoryId: string | null
  },
): Promise<{ destinoPrevisto: string | null }> {
  const absAmount = Math.abs(args.amountCents)
  const transferGroupId = crypto.randomUUID()

  await tx.insert(transactions).values({
    orgId: args.orgId,
    accountId: args.accountId,
    type: 'transfer',
    amountCents: -absAmount,
    description: args.description,
    date: args.date,
    externalId: args.externalId,
    importedAt: args.importedAt,
    transferGroupId,
    categoryId: args.categoryId,
    isAutoCategorized: false,
  }).onConflictDoNothing()

  await tx.update(accounts)
    .set({ balanceCents: sql`balance_cents + ${-absAmount}` })
    .where(eq(accounts.id, args.accountId))

  // Sem FITID não há chave de dedupe para a perna prevista: segue o caminho
  // antigo, perna real.
  const destinoOpenFinance = args.externalId !== null && (await isOpenFinanceLinkedAccount(tx, args.orgId, args.destAccountId))

  if (destinoOpenFinance) {
    await tx.insert(transactions).values(
      buildForecastTransferLegRow(
        { orgId: args.orgId, amountCents: -absAmount, date: args.date, externalId: args.externalId!, balanceApplied: false },
        args.accountId,
        args.destAccountId,
        transferGroupId,
      ),
    ).onConflictDoNothing()
    return { destinoPrevisto: args.destAccountId }
  }

  await tx.insert(transactions).values({
    orgId: args.orgId,
    accountId: args.destAccountId,
    type: 'transfer',
    amountCents: absAmount,
    description: args.description,
    date: args.date,
    transferGroupId,
    categoryId: args.categoryId,
    isAutoCategorized: false,
  })

  await tx.update(accounts)
    .set({ balanceCents: sql`balance_cents + ${absAmount}` })
    .where(eq(accounts.id, args.destAccountId))

  return { destinoPrevisto: null }
}
```

Ordem dos updates de saldo mudou (origem antes do insert da perna); o efeito é o mesmo, dentro da mesma transação.

- [ ] **Step 4: Usar em `import-actions.ts`** — antes do `db.transaction`, `const destinosPrevistos = new Set<string>()`. Trocar o `for (const item of transferItems) { ... }` inteiro por:

```ts
    // Transferências: perna da conta importada + a da outra conta própria.
    for (const item of transferItems) {
      const { destinoPrevisto } = await inserirTransferenciaImportada(tx as unknown as Db, {
        orgId,
        accountId,
        destAccountId: item.destAccountId,
        amountCents: item.tx.amountCents,
        description: item.tx.description,
        date: item.tx.date,
        externalId: item.tx.externalId ?? null,
        importedAt,
        categoryId: overrideMap.get(item.idx)?.categoryId ?? null,
      })
      if (destinoPrevisto) destinosPrevistos.add(destinoPrevisto)
      importedCount++
    }
```

Depois das invalidações de cache, antes do `return { imported, skipped }`:

```ts
  // A ponta real pode já estar na conta de destino: propõe o par agora.
  for (const conta of destinosPrevistos) {
    try {
      await criarPropostasDeConciliacao(getDb(), orgId, conta)
    } catch (error) {
      console.error('[import] falha ao propor conciliacao da perna prevista:', error)
    }
  }
```

Imports: `inserirTransferenciaImportada` de `./import-transfer`, `criarPropostasDeConciliacao` de `./forecast-match-db`, e `type Db = ReturnType<typeof getDb>` se o arquivo ainda não tiver. Remover imports que ficarem sem uso. Conferir `wc -l` < 500.

- [ ] **Step 5: Rodar** `npx vitest run __tests__/finance` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/finance/import-transfer.ts apps/web/lib/finance/import-actions.ts apps/web/__tests__/finance/import-transfer.test.ts
git commit -m "feat(import): transferencia OFX para conta Open Finance cria perna prevista"
```

---

### Fechamento

- [ ] `pnpm typecheck` e `cd apps/web && npx vitest run` → tudo verde.
- [ ] `pnpm --filter @floow/web build` → sem erro.
- [ ] Depois do merge em master e deploy: rodar `POST /api/admin/backfill-counterparties` uma vez, logado na org com dados, e conferir na resposta `updated` e `pernasPrevistas`.
