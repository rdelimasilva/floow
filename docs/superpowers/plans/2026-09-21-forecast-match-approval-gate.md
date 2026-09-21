# Gate de aprovação da conciliação previsto×realizado — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O sync passa a criar propostas de conciliação previsto×realizado, e o vínculo só é gravado quando o usuário aprova cada par numa fila própria.

**Architecture:** Tabela nova `forecast_match_proposals` guarda proposta pendente, aprovada e recusada; três índices únicos garantem "par recusado nunca volta", "uma proposta aberta por previsão" e "um realizado não é reivindicado por duas previsões". `transactions.matched_transaction_id` continua sendo a única verdade do "conciliado" e passa a ser gravado só na aprovação. A fila é uma tela não bloqueante em `/transactions/matches`.

**Tech Stack:** Next.js 15 (App Router, server actions), Drizzle ORM, Postgres (Supabase), Vitest + @testing-library/react, pnpm/turbo.

**Spec:** `docs/superpowers/specs/2026-09-21-forecast-match-approval-gate-design.md`

## Global Constraints

- **Idioma:** todo texto de UI, comentário e nome de teste em português do Brasil, com acentuação correta. Identificadores de código em inglês quando o arquivo já usa inglês; nomes novos de domínio em português seguem o padrão do repo (`contasDoFiltro`, `paginaQueAbre`).
- **Limite de arquivo:** nenhum arquivo passa de 500 linhas (`CLAUDE.md`). Se for passar, divida antes.
- **TDD:** cada tarefa começa por um teste que falha. Rode o teste e veja a falha antes de implementar.
- **Saldo:** nenhuma tarefa deste plano pode alterar o que entra em `accounts.balance_cents` nem o saldo corrido da listagem. Proposta pendente não move saldo.
- **`matched_transaction_id`:** só a action de aprovação grava. Nenhum outro caminho.
- **Migrations:** numeração sequencial em `supabase/migrations/`; a última é `00046_estorna_previsao_do_saldo.sql`, então a nova é `00047`.
- **Catraca de RLS:** `apps/web/__tests__/auth/rls-ledger.test.ts` falha se um arquivo novo chamar `getDb()` sem estar listado em `PENDENTES`. Leituras novas usam `withUserDb`; a escrita que toca `transactions` usa `getDb()` e entra na lista.
- **Commits:** ao fim de cada tarefa, com a linha `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Verificação:** `cd apps/web && npx vitest run` e `npx tsc --noEmit -p tsconfig.json` limpos antes de cada commit.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/00047_forecast_match_proposals.sql` (criar) | Tabela, índices, RLS |
| `packages/db/src/schema/forecast-match.ts` (criar) | Tabela em Drizzle + tipos inferidos |
| `packages/db/src/index.ts` (modificar) | Exportar o módulo novo |
| `apps/web/lib/finance/forecast-match-db.ts` (modificar) | Passa a inserir proposta em vez de gravar vínculo |
| `apps/web/lib/finance/forecast-match-actions.ts` (criar) | `aprovarProposta` / `recusarProposta` |
| `apps/web/lib/finance/forecast-match-queries.ts` (criar) | Fila pendente + contagem |
| `apps/web/app/(app)/transactions/matches/page.tsx` (criar) | Rota da fila |
| `apps/web/components/finance/match-proposal-queue.tsx` (criar) | Fila (client) com os dois botões |
| `apps/web/components/layout/sidebar.tsx` (modificar) | Item "Conciliações" + badge |
| `apps/web/app/(app)/layout.tsx` (modificar) | Alimenta o contador |
| `apps/web/lib/finance/queries-transactions.ts` (modificar) | `hasPendingMatchProposal` na linha |
| `apps/web/components/finance/transaction-list-types.ts` (modificar) | Campo novo na linha |
| `apps/web/components/finance/transaction-display-row.tsx` (modificar) | Selo "conciliar?" |

---

### Task 1: Tabela, índices e schema Drizzle

**Files:**
- Create: `supabase/migrations/00047_forecast_match_proposals.sql`
- Create: `packages/db/src/schema/forecast-match.ts`
- Modify: `packages/db/src/index.ts` (linha do barrel, depois de `./schema/counterparty`)
- Test: `apps/web/__tests__/finance/proposta-de-conciliacao-schema.test.ts`

**Interfaces:**
- Consumes: `orgs` (`packages/db/src/schema/auth.ts`), `transactions` (`packages/db/src/schema/finance.ts`)
- Produces: `forecastMatchProposals` (tabela Drizzle), `forecastMatchStatusEnum`, tipos `ForecastMatchProposal` / `NewForecastMatchProposal`. Colunas: `id`, `orgId`, `forecastTransactionId`, `realizedTransactionId`, `status`, `proposedAt`, `decidedAt`.

- [ ] **Step 1: Escreva o teste que falha**

```ts
// apps/web/__tests__/finance/proposta-de-conciliacao-schema.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { forecastMatchProposals } from '@floow/db'

/**
 * As três regras do gate moram em índice, não em código: o par recusado nunca
 * volta, uma proposta aberta por previsão, um realizado não é reivindicado por
 * duas previsões. Índice erra na frente do usuário; checagem em código erra em
 * silêncio quando dois cliques chegam juntos.
 */
const SQL = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '00047_forecast_match_proposals.sql'),
  'utf8',
).toLowerCase()

describe('tabela de propostas', () => {
  it('a tabela Drizzle tem as colunas que a fila usa', () => {
    const colunas = Object.keys(forecastMatchProposals)
    expect(colunas).toEqual(
      expect.arrayContaining([
        'id', 'orgId', 'forecastTransactionId', 'realizedTransactionId',
        'status', 'proposedAt', 'decidedAt',
      ]),
    )
  })
})

describe('migration 00047', () => {
  it('o par recusado nunca volta: único em (previsão, realizado)', () => {
    expect(SQL).toMatch(/unique index[\s\S]*\(forecast_transaction_id, realized_transaction_id\)/)
  })

  it('uma proposta aberta por previsão', () => {
    expect(SQL).toMatch(/unique index[\s\S]*\(forecast_transaction_id\)[\s\S]*where status = 'pending'/)
  })

  it('um realizado não é reivindicado por duas previsões', () => {
    expect(SQL).toMatch(/unique index[\s\S]*\(realized_transaction_id\)[\s\S]*where status = 'pending'/)
  })

  it('apagar qualquer ponta leva a proposta junto', () => {
    const cascades = SQL.match(/on delete cascade/g) ?? []
    expect(cascades.length).toBeGreaterThanOrEqual(3)
  })

  it('RLS ligada, com as quatro políticas por org', () => {
    expect(SQL).toContain('enable row level security')
    for (const acao of ['select', 'insert', 'update', 'delete']) {
      expect(SQL).toContain(`for ${acao} to authenticated`)
    }
    expect(SQL).toContain('public.get_user_org_ids()')
  })

  it('nao cria proposta retroativa para o que ja esta casado', () => {
    // O passado e fato consumado (spec §4). Um INSERT ... SELECT aqui poria a
    // org em mutirao no primeiro deploy.
    expect(SQL).not.toContain('insert into public.forecast_match_proposals')
  })
})
```

- [ ] **Step 2: Rode e veja falhar**

Run: `cd apps/web && npx vitest run __tests__/finance/proposta-de-conciliacao-schema.test.ts`
Expected: FAIL — `ENOENT` na leitura da migration e `forecastMatchProposals` não exportado por `@floow/db`.

- [ ] **Step 3: Escreva a migration**

```sql
-- supabase/migrations/00047_forecast_match_proposals.sql
-- =============================================================================
-- Conciliação previsto×realizado passa a pedir aprovação
-- -----------------------------------------------------------------------------
-- `matchForecastsForAccount` gravava `transactions.matched_transaction_id`
-- direto depois de cada sync: a previsão era declarada cumprida sem ninguém
-- olhar. O risco não é simétrico — casar errado ESCONDE um lançamento de
-- verdade (a previsão sai da fila e o realizado fica sozinho no saldo), e não
-- casar só deixa a previsão pedindo ação.
--
-- Agora o sync propõe e o usuário decide. `matched_transaction_id` continua
-- sendo a única verdade do "conciliado" — quem lê saldo e selo não precisa
-- saber que propostas existem.
--
-- Ver docs/superpowers/specs/2026-09-21-forecast-match-approval-gate-design.md
-- =============================================================================

CREATE TABLE public.forecast_match_proposals (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  forecast_transaction_id  uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  realized_transaction_id  uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  status                   text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'refused')),
  proposed_at              timestamptz NOT NULL DEFAULT now(),
  decided_at               timestamptz
);

CREATE INDEX idx_fmp_org_status ON public.forecast_match_proposals(org_id, status);

-- O par recusado nunca volta a ser proposto: o criador insere com
-- ON CONFLICT DO NOTHING, então a recusa é uma parede e não uma checagem.
CREATE UNIQUE INDEX uq_fmp_par
  ON public.forecast_match_proposals(forecast_transaction_id, realized_transaction_id);

-- Uma proposta aberta por previsão.
CREATE UNIQUE INDEX uq_fmp_previsao_pendente
  ON public.forecast_match_proposals(forecast_transaction_id)
  WHERE status = 'pending';

-- Um realizado não é reivindicado por duas previsões ao mesmo tempo. Espelha
-- idx_transactions_matched_unique da 00042.
CREATE UNIQUE INDEX uq_fmp_realizado_pendente
  ON public.forecast_match_proposals(realized_transaction_id)
  WHERE status = 'pending';

ALTER TABLE public.forecast_match_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forecast_match_proposals: members can select"
  ON public.forecast_match_proposals FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "forecast_match_proposals: members can insert"
  ON public.forecast_match_proposals FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "forecast_match_proposals: members can update"
  ON public.forecast_match_proposals FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "forecast_match_proposals: members can delete"
  ON public.forecast_match_proposals FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

COMMENT ON TABLE public.forecast_match_proposals IS
  'Par previsto x realizado que o sistema propoe. Aprovar grava matched_transaction_id na previsao; recusar barra aquele par para sempre.';
```

- [ ] **Step 4: Escreva o schema Drizzle**

```ts
// packages/db/src/schema/forecast-match.ts
import { pgTable, pgEnum, uuid, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { orgs } from './auth'
import { transactions } from './finance'

export const forecastMatchStatusEnum = pgEnum('forecast_match_status', [
  'pending',
  'approved',
  'refused',
])

/**
 * Par previsto×realizado que o sistema propõe e o usuário decide.
 *
 * `status` é `text` com CHECK no banco (migration 00047) e não um enum do
 * Postgres: enum novo exigiria `ALTER TYPE` a cada estado futuro, e aqui os
 * três valores são fechados por desenho. O enum Drizzle acima existe só para
 * o tipo do TypeScript.
 *
 * Ver docs/superpowers/specs/2026-09-21-forecast-match-approval-gate-design.md
 */
export const forecastMatchProposals = pgTable(
  'forecast_match_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    /** A previsão de template que espera confirmação. */
    forecastTransactionId: uuid('forecast_transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    /** O lançamento do banco que o sistema acha que a cumpriu. */
    realizedTransactionId: uuid('realized_transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    status: forecastMatchStatusEnum('status').notNull().default('pending'),
    proposedAt: timestamp('proposed_at', { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => ({
    idxOrgStatus: index('idx_fmp_org_status').on(table.orgId, table.status),
    uqPar: uniqueIndex('uq_fmp_par').on(table.forecastTransactionId, table.realizedTransactionId),
    uqPrevisaoPendente: uniqueIndex('uq_fmp_previsao_pendente')
      .on(table.forecastTransactionId)
      .where(sql`status = 'pending'`),
    uqRealizadoPendente: uniqueIndex('uq_fmp_realizado_pendente')
      .on(table.realizedTransactionId)
      .where(sql`status = 'pending'`),
  }),
)

export type ForecastMatchProposal = typeof forecastMatchProposals.$inferSelect
export type NewForecastMatchProposal = typeof forecastMatchProposals.$inferInsert
```

- [ ] **Step 5: Exporte no barrel**

Em `packages/db/src/index.ts`, depois da linha `export * from './schema/counterparty'`:

```ts
export * from './schema/forecast-match'
```

- [ ] **Step 6: Rode e veja passar**

Run: `cd apps/web && npx vitest run __tests__/finance/proposta-de-conciliacao-schema.test.ts`
Expected: PASS (7 testes)

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: sem saída

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/00047_forecast_match_proposals.sql packages/db/src/schema/forecast-match.ts packages/db/src/index.ts apps/web/__tests__/finance/proposta-de-conciliacao-schema.test.ts
git commit -m "feat(db): tabela de propostas de conciliacao previsto x realizado

As tres regras do gate moram em indice unico e nao em codigo: o par recusado
nunca volta, uma proposta aberta por previsao, um realizado nao e reivindicado
por duas previsoes. Checagem em codigo erra em silencio quando dois cliques
chegam juntos.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: O sync propõe em vez de casar

**Files:**
- Modify: `apps/web/lib/finance/forecast-match-db.ts` (a função inteira; hoje 1-140)
- Modify: `apps/web/lib/openfinance/sync.ts:47,73,145` (renomear o contador do resumo)
- Test: `apps/web/__tests__/finance/sync-propoe-nao-casa.test.ts`

**Interfaces:**
- Consumes: `forecastMatchProposals` (Task 1); `matchForecast` de `@floow/core-finance` (inalterada)
- Produces: `criarPropostasDeConciliacao(db, orgId, accountId): Promise<number>` — substitui `matchForecastsForAccount`, devolve quantas propostas criou. `SyncSummary.propostasDeConciliacao: number` no lugar de `matchedForecasts`.

- [ ] **Step 1: Escreva o teste que falha**

```ts
// apps/web/__tests__/finance/sync-propoe-nao-casa.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O sync para de decidir. Antes ele gravava `matched_transaction_id` direto:
 * previsão declarada cumprida sem ninguém olhar, e casar errado esconde um
 * lançamento de verdade. Agora insere PROPOSTA e quem efetiva é o usuário.
 *
 * `onConflictDoNothing` cobre os dois casos que não devem virar erro: o par já
 * recusado (barrado pelo único em (previsão, realizado)) e a previsão que já
 * tem proposta aberta.
 */

const ops: { op: string; payload?: unknown; table?: string }[] = []
const selectQueue: unknown[][] = []

function chain(result: unknown[], atual: { op: string; payload?: unknown }): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'returning', 'onConflictDoNothing', 'leftJoin']) {
    c[m] = () => chain(result, atual)
  }
  c.set = (payload: unknown) => { atual.payload = payload; return chain(result, atual) }
  c.values = (payload: unknown) => { atual.payload = payload; return chain(result, atual) }
  return c
}

const db = {
  select: () => { const op = { op: 'select' }; ops.push(op); return chain(selectQueue.shift() ?? [], op) },
  insert: (table: unknown) => {
    const op = { op: 'insert', table: (table as { _?: { name?: string } })?._?.name }
    ops.push(op)
    return chain([{ id: 'prop-1' }], op)
  },
  update: () => { const op = { op: 'update' }; ops.push(op); return chain([], op) },
} as never

vi.mock('@floow/db', () => ({
  getDb: () => db,
  transactions: { _: { name: 'transactions' }, id: 'id', orgId: 'org_id', accountId: 'account_id', amountCents: 'amount_cents', date: 'date', description: 'description', externalId: 'external_id', recurringTemplateId: 'recurring_template_id', balanceApplied: 'balance_applied', matchedTransactionId: 'matched_transaction_id', isIgnored: 'is_ignored' },
  forecastMatchProposals: { _: { name: 'forecast_match_proposals' }, forecastTransactionId: 'forecast_transaction_id', realizedTransactionId: 'realized_transaction_id', orgId: 'org_id', status: 'status' },
}))

const { criarPropostasDeConciliacao } = await import('@/lib/finance/forecast-match-db')

const PREVISTO = { id: 'prev-1', amountCents: -120000, date: new Date('2026-09-01'), description: 'Aluguel' }
const REALIZADO = { id: 'real-1', amountCents: -120000, date: new Date('2026-09-03'), description: 'Pagamento de boleto HANNI DAVID' }

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
})

describe('criarPropostasDeConciliacao', () => {
  it('insere proposta para o par que o casamento escolhe', async () => {
    selectQueue.push([PREVISTO], [REALIZADO])

    const criadas = await criarPropostasDeConciliacao(db, 'org-1', 'conta-1')

    expect(criadas).toBe(1)
    const insert = ops.find((o) => o.op === 'insert')
    expect(insert?.table).toBe('forecast_match_proposals')
    expect(insert?.payload).toMatchObject({
      orgId: 'org-1',
      forecastTransactionId: 'prev-1',
      realizedTransactionId: 'real-1',
      status: 'pending',
    })
  })

  it('NUNCA grava o vinculo — quem efetiva e o usuario', async () => {
    selectQueue.push([PREVISTO], [REALIZADO])

    await criarPropostasDeConciliacao(db, 'org-1', 'conta-1')

    expect(ops.some((o) => o.op === 'update')).toBe(false)
  })

  it('sem previsao aberta, nao consulta realizado nem insere', async () => {
    selectQueue.push([])

    const criadas = await criarPropostasDeConciliacao(db, 'org-1', 'conta-1')

    expect(criadas).toBe(0)
    expect(ops.filter((o) => o.op === 'select')).toHaveLength(1)
    expect(ops.some((o) => o.op === 'insert')).toBe(false)
  })

  it('valor fora de tolerancia nao vira proposta', async () => {
    selectQueue.push([PREVISTO], [{ ...REALIZADO, amountCents: -500000 }])

    const criadas = await criarPropostasDeConciliacao(db, 'org-1', 'conta-1')

    expect(criadas).toBe(0)
    expect(ops.some((o) => o.op === 'insert')).toBe(false)
  })

  it('duas previsoes nao reivindicam o mesmo realizado na mesma rodada', async () => {
    selectQueue.push([PREVISTO, { ...PREVISTO, id: 'prev-2' }], [REALIZADO])

    const criadas = await criarPropostasDeConciliacao(db, 'org-1', 'conta-1')

    expect(criadas).toBe(1)
  })
})
```

- [ ] **Step 2: Rode e veja falhar**

Run: `cd apps/web && npx vitest run __tests__/finance/sync-propoe-nao-casa.test.ts`
Expected: FAIL — `criarPropostasDeConciliacao` não é exportada por `forecast-match-db.ts`.

- [ ] **Step 3: Reescreva o corpo de `forecast-match-db.ts`**

Mantenha o cabeçalho de imports, `JANELA_BUSCA_DIAS`, `DIA_EM_MS` e as duas consultas (`previstos`, `realizados`) como estão. Troque o nome da função e o bloco de escrita:

```ts
/**
 * Propõe, nesta conta, o par previsto×realizado que o casamento encontrar.
 *
 * Antes esta função GRAVAVA o vínculo (`matched_transaction_id`) e a previsão
 * era declarada cumprida sem ninguém olhar. Casar errado esconde um lançamento
 * de verdade: a previsão sai da fila e o realizado fica sozinho no saldo, sem
 * nada apontando que o par era mentira. Agora ela só propõe — quem efetiva é
 * `aprovarProposta`.
 *
 * `onConflictDoNothing` cobre os dois casos que não são erro: o par já foi
 * recusado (barrado pelo único em (previsão, realizado)) ou a previsão já tem
 * proposta aberta. Sem ele, a segunda rodada de sync estouraria.
 *
 * O filtro de previsão aberta é o mesmo de antes — `balance_applied = false`,
 * sem vínculo, de template, não ignorada.
 */
export async function criarPropostasDeConciliacao(
  db: Db,
  orgId: string,
  accountId: string,
): Promise<number> {
  // ... consultas `previstos` e `realizados` inalteradas ...

  const reivindicados = new Set<string>()
  let criadas = 0

  for (const realizado of realizados) {
    const disponiveis = abertos.filter((p) => !reivindicados.has(p.id))
    if (disponiveis.length === 0) break

    const casado = matchForecast(
      {
        amountCents: realizado.amountCents,
        date: new Date(realizado.date),
        description: realizado.description,
      },
      disponiveis,
    )

    if (!casado) continue

    reivindicados.add(casado.id)

    const inserida = await db
      .insert(forecastMatchProposals)
      .values({
        orgId,
        forecastTransactionId: casado.id,
        realizedTransactionId: realizado.id,
        status: 'pending',
      })
      .onConflictDoNothing()
      .returning({ id: forecastMatchProposals.id })

    if (inserida.length > 0) criadas++
  }

  return criadas
}
```

Acrescente ao filtro de `previstos` a exclusão de quem já tem proposta pendente:

```ts
        // Previsão com proposta aberta não é proposta de novo. O índice único
        // parcial barraria, mas gastar uma tentativa de insert por rodada de
        // sync para descobrir isso é desperdício.
        notExists(
          db
            .select({ um: sql`1` })
            .from(forecastMatchProposals)
            .where(
              and(
                eq(forecastMatchProposals.forecastTransactionId, transactions.id),
                eq(forecastMatchProposals.status, 'pending'),
              ),
            ),
        ),
```

Imports a acrescentar no topo do arquivo: `forecastMatchProposals` de `@floow/db`, e `notExists`, `sql` de `drizzle-orm`.

- [ ] **Step 4: Atualize o sync**

Em `apps/web/lib/openfinance/sync.ts`:

- linha 26: `import { criarPropostasDeConciliacao } from '@/lib/finance/forecast-match-db'`
- linha 47: `propostasDeConciliacao: number` no lugar de `matchedForecasts: number`
- linha 73: `propostasDeConciliacao: 0` no inicializador
- linha 145: `summary.propostasDeConciliacao += await criarPropostasDeConciliacao(db, connection.orgId, resource.accountId)`

O nome muda porque o número mudou de significado: eram vínculos gravados, agora são propostas criadas. Manter `matchedForecasts` faria o resumo do sync mentir.

- [ ] **Step 5: Rode e veja passar**

Run: `cd apps/web && npx vitest run __tests__/finance/sync-propoe-nao-casa.test.ts __tests__/finance/forecast-match-db.test.ts`
Expected: PASS. Se `forecast-match-db.test.ts` (que existe hoje e testa o comportamento antigo) falhar, reescreva-o para o comportamento novo — ele era a trava do que acabou de mudar.

Run: `cd apps/web && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: suíte inteira verde, typecheck sem saída

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/finance/forecast-match-db.ts apps/web/lib/openfinance/sync.ts apps/web/__tests__/finance/
git commit -m "feat(finance): o sync propoe a conciliacao em vez de decidir

Gravava \`matched_transaction_id\` direto: previsao declarada cumprida sem
ninguem olhar. Agora insere proposta pendente, com onConflictDoNothing para o
par ja recusado e para a previsao que ja tem proposta aberta.

O contador do resumo do sync mudou de nome junto, porque mudou de significado:
eram vinculos gravados, agora sao propostas criadas.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Aprovar e recusar

**Files:**
- Create: `apps/web/lib/finance/forecast-match-actions.ts`
- Modify: `apps/web/__tests__/auth/rls-ledger.test.ts` (acrescentar o arquivo novo em `PENDENTES`)
- Test: `apps/web/__tests__/finance/aprovar-e-recusar-conciliacao.test.ts`

**Interfaces:**
- Consumes: `forecastMatchProposals` (Task 1)
- Produces: `aprovarProposta(propostaId: string): Promise<{ efetivada: boolean }>` e `recusarProposta(propostaId: string): Promise<{ recusada: boolean }>`. `false` nos dois quando a proposta não está mais `pending` — clique duplo não é erro.

- [ ] **Step 1: Escreva o teste que falha**

```ts
// apps/web/__tests__/finance/aprovar-e-recusar-conciliacao.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Aprovar é o único caminho que grava `matched_transaction_id`. É ele que
 * efetiva a conciliação, e por isso as duas escritas — vínculo na previsão e
 * status na proposta — vão na MESMA transação: meio caminho deixaria uma
 * previsão casada com proposta ainda pendente, que a fila mostraria de novo.
 *
 * Recusar não toca na previsão: ela segue aberta e elegível a outra proposta
 * num sync futuro. O par recusado é barrado pelo índice único, não aqui.
 */

const ops: { op: string; payload?: Record<string, unknown> }[] = []
const selectQueue: unknown[][] = []

function chain(result: unknown[], atual?: { op: string; payload?: Record<string, unknown> }): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'returning', 'leftJoin']) c[m] = () => chain(result, atual)
  c.set = (payload: Record<string, unknown>) => { if (atual) atual.payload = payload; return chain(result, atual) }
  return c
}

const tx = {
  select: () => { const op = { op: 'select' }; ops.push(op); return chain(selectQueue.shift() ?? [], op) },
  update: (table: unknown) => {
    const op = { op: `update:${(table as { _?: { name?: string } })?._?.name}` }
    ops.push(op)
    return chain([{ id: 'x' }], op)
  },
}

vi.mock('@floow/db', () => ({
  getDb: () => ({ transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) }),
  transactions: { _: { name: 'transactions' }, id: 'id', orgId: 'org_id', matchedTransactionId: 'matched_transaction_id' },
  forecastMatchProposals: { _: { name: 'forecast_match_proposals' }, id: 'id', orgId: 'org_id', status: 'status', decidedAt: 'decided_at', forecastTransactionId: 'forecast_transaction_id', realizedTransactionId: 'realized_transaction_id' },
}))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1') }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateTransactionData: vi.fn(),
  revalidateSnapshotData: vi.fn(),
  revalidateCategoryData: vi.fn(),
}))

const { aprovarProposta, recusarProposta } = await import('@/lib/finance/forecast-match-actions')

const PENDENTE = {
  id: 'prop-1',
  forecastTransactionId: 'prev-1',
  realizedTransactionId: 'real-1',
  status: 'pending',
}

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
})

describe('aprovarProposta', () => {
  it('grava o vinculo na previsao e fecha a proposta', async () => {
    selectQueue.push([PENDENTE])

    const { efetivada } = await aprovarProposta('prop-1')

    expect(efetivada).toBe(true)
    const naPrevisao = ops.find((o) => o.op === 'update:transactions')
    expect(naPrevisao?.payload).toMatchObject({ matchedTransactionId: 'real-1' })
    const naProposta = ops.find((o) => o.op === 'update:forecast_match_proposals')
    expect(naProposta?.payload).toMatchObject({ status: 'approved' })
    expect(naProposta?.payload?.decidedAt).toBeInstanceOf(Date)
  })

  it('proposta que nao esta pendente nao faz nada — clique duplo nao e erro', async () => {
    selectQueue.push([])

    const { efetivada } = await aprovarProposta('prop-1')

    expect(efetivada).toBe(false)
    expect(ops.some((o) => o.op.startsWith('update'))).toBe(false)
  })
})

describe('recusarProposta', () => {
  it('fecha a proposta e nao toca na previsao', async () => {
    selectQueue.push([PENDENTE])

    const { recusada } = await recusarProposta('prop-1')

    expect(recusada).toBe(true)
    expect(ops.some((o) => o.op === 'update:transactions')).toBe(false)
    expect(ops.find((o) => o.op === 'update:forecast_match_proposals')?.payload)
      .toMatchObject({ status: 'refused' })
  })

  it('proposta ja decidida nao faz nada', async () => {
    selectQueue.push([])

    const { recusada } = await recusarProposta('prop-1')

    expect(recusada).toBe(false)
    expect(ops.some((o) => o.op.startsWith('update'))).toBe(false)
  })
})
```

- [ ] **Step 2: Rode e veja falhar**

Run: `cd apps/web && npx vitest run __tests__/finance/aprovar-e-recusar-conciliacao.test.ts`
Expected: FAIL — módulo `@/lib/finance/forecast-match-actions` não existe.

- [ ] **Step 3: Escreva as actions**

```ts
// apps/web/lib/finance/forecast-match-actions.ts
'use server'

import { getDb, transactions, forecastMatchProposals } from '@floow/db'
import { and, eq } from 'drizzle-orm'
import { getOrgId } from './queries'
import { revalidateTransactionData } from './revalidate'

/**
 * Efetiva a conciliação proposta: a previsão passa a apontar para o lançamento
 * do banco que a cumpriu.
 *
 * Este é o ÚNICO caminho que grava `matched_transaction_id`. O sync só propõe
 * (ver `forecast-match-db.ts`), porque casar errado esconde um lançamento de
 * verdade e a decisão é do dono do dinheiro.
 *
 * As duas escritas vão na mesma transação de banco: meio caminho deixaria uma
 * previsão casada com a proposta ainda pendente, e a fila a mostraria de novo.
 *
 * Devolve `efetivada: false` quando a proposta não está mais pendente — dois
 * cliques, duas abas, ou o sync tendo apagado a ponta. Não é erro.
 */
export async function aprovarProposta(propostaId: string): Promise<{ efetivada: boolean }> {
  const orgId = await getOrgId()
  const db = getDb()

  const efetivada = await db.transaction(async (tx) => {
    const [proposta] = await tx
      .select({
        id: forecastMatchProposals.id,
        forecastTransactionId: forecastMatchProposals.forecastTransactionId,
        realizedTransactionId: forecastMatchProposals.realizedTransactionId,
      })
      .from(forecastMatchProposals)
      .where(
        and(
          eq(forecastMatchProposals.id, propostaId),
          eq(forecastMatchProposals.orgId, orgId),
          eq(forecastMatchProposals.status, 'pending'),
        ),
      )
      .limit(1)

    if (!proposta) return false

    await tx
      .update(transactions)
      .set({ matchedTransactionId: proposta.realizedTransactionId })
      .where(
        and(
          eq(transactions.id, proposta.forecastTransactionId),
          eq(transactions.orgId, orgId),
        ),
      )

    await tx
      .update(forecastMatchProposals)
      .set({ status: 'approved', decidedAt: new Date() })
      .where(eq(forecastMatchProposals.id, proposta.id))

    return true
  })

  if (efetivada) revalidateTransactionData(orgId)

  return { efetivada }
}

/**
 * Recusa o par: não era o mesmo dinheiro.
 *
 * A previsão não é tocada — segue aberta, sem vínculo, elegível a outra
 * proposta no próximo sync. Quem garante que ESTE par não volta é o índice
 * único em (previsão, realizado) da migration 00047, combinado com o
 * `onConflictDoNothing` de quem propõe.
 */
export async function recusarProposta(propostaId: string): Promise<{ recusada: boolean }> {
  const orgId = await getOrgId()
  const db = getDb()

  const recusada = await db.transaction(async (tx) => {
    const [proposta] = await tx
      .select({ id: forecastMatchProposals.id })
      .from(forecastMatchProposals)
      .where(
        and(
          eq(forecastMatchProposals.id, propostaId),
          eq(forecastMatchProposals.orgId, orgId),
          eq(forecastMatchProposals.status, 'pending'),
        ),
      )
      .limit(1)

    if (!proposta) return false

    await tx
      .update(forecastMatchProposals)
      .set({ status: 'refused', decidedAt: new Date() })
      .where(eq(forecastMatchProposals.id, proposta.id))

    return true
  })

  if (recusada) revalidateTransactionData(orgId)

  return { recusada }
}
```

- [ ] **Step 4: Registre na catraca do RLS**

Em `apps/web/__tests__/auth/rls-ledger.test.ts`, dentro de `PENDENTES`, em ordem alfabética:

```ts
  // Escreve em `transactions` (o vinculo da conciliacao), e as politicas de
  // ESCRITA daquela tabela ainda nao estao no ar — a migracao de RLS cobre
  // leitura. Mesma razao de `apply-due.ts`.
  'lib/finance/forecast-match-actions.ts',
```

- [ ] **Step 5: Rode e veja passar**

Run: `cd apps/web && npx vitest run __tests__/finance/aprovar-e-recusar-conciliacao.test.ts __tests__/auth/rls-ledger.test.ts`
Expected: PASS nos dois

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/finance/forecast-match-actions.ts apps/web/__tests__/finance/aprovar-e-recusar-conciliacao.test.ts apps/web/__tests__/auth/rls-ledger.test.ts
git commit -m "feat(finance): aprovar e recusar a conciliacao proposta

Aprovar e o unico caminho que grava \`matched_transaction_id\`, e as duas
escritas vao na mesma transacao: meio caminho deixaria previsao casada com
proposta pendente, e a fila a mostraria de novo. Recusar nao toca na previsao.

As duas sao idempotentes: proposta que nao esta mais pendente devolve false em
vez de estourar, porque clique duplo e duas abas nao sao erro.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: A fila

**Files:**
- Create: `apps/web/lib/finance/forecast-match-queries.ts`
- Create: `apps/web/app/(app)/transactions/matches/page.tsx`
- Create: `apps/web/components/finance/match-proposal-queue.tsx`
- Test: `apps/web/__tests__/finance/fila-de-conciliacao.test.tsx`

**Interfaces:**
- Consumes: `aprovarProposta`, `recusarProposta` (Task 3); `forecastMatchProposals` (Task 1)
- Produces:
  - `getPropostasPendentes(orgId: string): Promise<PropostaPendente[]>`, onde `PropostaPendente = { id, previsao: LadoDoPar, realizado: LadoDoPar, contaNome: string | null, diasDeDiferenca: number, diferencaCents: number }` e `LadoDoPar = { id, date: string, description: string, amountCents: number }`
  - `contarPropostasPendentes(orgId: string): Promise<number>` (usada na Task 5)
  - `<MatchProposalQueue propostas={...} />`

- [ ] **Step 1: Escreva o teste que falha**

```tsx
// apps/web/__tests__/finance/fila-de-conciliacao.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import React from 'react'

/**
 * A fila mostra os dois lados e o PORQUÊ do par — dias de diferença e
 * diferença de valor. Sem isso, "é o mesmo?" é uma pergunta sem informação:
 * `matchForecast` aceita até 7 dias de janela e 8% de diferença com palavra em
 * comum, então o par plausível e o par errado chegam parecidos na tela.
 */

const aprovarProposta = vi.fn(async (_id: string) => ({ efetivada: true }))
const recusarProposta = vi.fn(async (_id: string) => ({ recusada: true }))

vi.mock('@/lib/finance/forecast-match-actions', () => ({ aprovarProposta, recusarProposta }))

const { MatchProposalQueue } = await import('@/components/finance/match-proposal-queue')
const { ToastProvider } = await import('@/components/ui/toast')

const PROPOSTA = {
  id: 'prop-1',
  previsao: { id: 'prev-1', date: '2026-09-01', description: 'Aluguel', amountCents: -120000 },
  realizado: { id: 'real-1', date: '2026-09-03', description: 'Pagamento de boleto HANNI DAVID', amountCents: -120000 },
  contaNome: 'Itaú',
  diasDeDiferenca: 2,
  diferencaCents: 0,
}

function renderFila(propostas = [PROPOSTA]) {
  render(
    React.createElement(ToastProvider, null,
      React.createElement(MatchProposalQueue, { propostas })),
  )
}

beforeEach(() => {
  aprovarProposta.mockClear()
  recusarProposta.mockClear()
})

describe('fila de conciliação', () => {
  it('mostra os dois lados do par', () => {
    renderFila()

    const cartao = screen.getByTestId('proposta-prop-1')
    within(cartao).getByText('Aluguel')
    within(cartao).getByText('Pagamento de boleto HANNI DAVID')
    within(cartao).getByText('Itaú')
  })

  it('mostra o porque do par', () => {
    renderFila()

    screen.getByText(/2 dias de diferença/)
    screen.getByText(/mesmo valor/)
  })

  it('valor diferente aparece com a diferenca', () => {
    renderFila([{ ...PROPOSTA, diferencaCents: 13885 }])

    screen.getByText(/R\$ 138,85 de diferença/)
  })

  it('"É o mesmo" aprova', async () => {
    renderFila()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'É o mesmo' }))
    })

    expect(aprovarProposta).toHaveBeenCalledWith('prop-1')
  })

  it('"São diferentes" recusa', async () => {
    renderFila()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'São diferentes' }))
    })

    expect(recusarProposta).toHaveBeenCalledWith('prop-1')
  })

  it('decidida, a proposta sai da tela', async () => {
    renderFila()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'É o mesmo' }))
    })

    expect(screen.queryByTestId('proposta-prop-1')).toBeNull()
  })

  it('fila vazia diz que nao ha nada', () => {
    renderFila([])

    screen.getByText('Nenhuma conciliação esperando.')
  })

  it('nao oferece aprovar todas — a decisao e par por par', () => {
    renderFila()

    expect(screen.queryByRole('button', { name: /todas/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Rode e veja falhar**

Run: `cd apps/web && npx vitest run __tests__/finance/fila-de-conciliacao.test.tsx`
Expected: FAIL — `@/components/finance/match-proposal-queue` não existe.

- [ ] **Step 3: Escreva as consultas**

```ts
// apps/web/lib/finance/forecast-match-queries.ts
import { and, asc, count, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { accounts, forecastMatchProposals, transactions } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'

export interface LadoDoPar {
  id: string
  date: string
  description: string
  amountCents: number
}

export interface PropostaPendente {
  id: string
  previsao: LadoDoPar
  realizado: LadoDoPar
  contaNome: string | null
  /** Distância em dias entre as duas datas — o porquê do par, na tela. */
  diasDeDiferenca: number
  /** Diferença absoluta de valor, em centavos. */
  diferencaCents: number
}

const DIA_EM_MS = 24 * 60 * 60 * 1000

/**
 * As propostas abertas da org, com os dois lados do par e o porquê dele.
 *
 * Dois aliases de `transactions` porque a linha junta previsão e realizado, que
 * são a mesma tabela. Ordenada por dinheiro, decrescente — o mesmo princípio
 * que a fila de contrapartes validou: "R$ 92 mil" move o usuário, "12 itens"
 * não.
 */
export async function getPropostasPendentes(orgId: string): Promise<PropostaPendente[]> {
  return withUserDb(async (db) => {
    const previsao = alias(transactions, 'previsao')
    const realizado = alias(transactions, 'realizado')

    const rows = await db
      .select({
        id: forecastMatchProposals.id,
        previsaoId: previsao.id,
        previsaoDate: previsao.date,
        previsaoDescription: previsao.description,
        previsaoAmount: previsao.amountCents,
        realizadoId: realizado.id,
        realizadoDate: realizado.date,
        realizadoDescription: realizado.description,
        realizadoAmount: realizado.amountCents,
        contaNome: accounts.name,
      })
      .from(forecastMatchProposals)
      .innerJoin(previsao, eq(previsao.id, forecastMatchProposals.forecastTransactionId))
      .innerJoin(realizado, eq(realizado.id, forecastMatchProposals.realizedTransactionId))
      .leftJoin(accounts, eq(accounts.id, realizado.accountId))
      .where(
        and(
          eq(forecastMatchProposals.orgId, orgId),
          eq(forecastMatchProposals.status, 'pending'),
        ),
      )
      .orderBy(sql`abs(${realizado.amountCents}) desc`, asc(forecastMatchProposals.proposedAt))

    const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : String(d))

    return rows.map((row) => ({
      id: row.id,
      previsao: {
        id: row.previsaoId,
        date: iso(row.previsaoDate),
        description: row.previsaoDescription,
        amountCents: row.previsaoAmount,
      },
      realizado: {
        id: row.realizadoId,
        date: iso(row.realizadoDate),
        description: row.realizadoDescription,
        amountCents: row.realizadoAmount,
      },
      contaNome: row.contaNome,
      diasDeDiferenca: Math.round(
        Math.abs(new Date(row.previsaoDate).getTime() - new Date(row.realizadoDate).getTime()) / DIA_EM_MS,
      ),
      diferencaCents: Math.abs(row.previsaoAmount - row.realizadoAmount),
    }))
  })
}

/** Quantas propostas esperam decisão — alimenta o badge do menu. */
export async function contarPropostasPendentes(orgId: string): Promise<number> {
  return withUserDb(async (db) => {
    const [row] = await db
      .select({ total: count() })
      .from(forecastMatchProposals)
      .where(
        and(
          eq(forecastMatchProposals.orgId, orgId),
          eq(forecastMatchProposals.status, 'pending'),
        ),
      )

    return Number(row?.total ?? 0)
  })
}
```

- [ ] **Step 4: Escreva a fila (client)**

```tsx
// apps/web/components/finance/match-proposal-queue.tsx
'use client'

import { useState } from 'react'
import { formatBRL } from '@floow/core-finance'
import { aprovarProposta, recusarProposta } from '@/lib/finance/forecast-match-actions'
import type { PropostaPendente } from '@/lib/finance/forecast-match-queries'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * A fila mostra os dois lados e o porquê do par.
 *
 * `matchForecast` aceita até 7 dias de janela e 8% de diferença de valor
 * quando há palavra em comum na descrição — então o par plausível e o par
 * errado chegam parecidos na tela. Sem dizer quantos dias e quanto de valor
 * separam os dois, "é o mesmo?" é pergunta sem informação.
 *
 * Sem "aprovar todas": a decisão é par por par por desenho, e um botão de
 * varredura devolveria o problema que este gate existe para resolver.
 */
export function MatchProposalQueue({ propostas: iniciais }: { propostas: PropostaPendente[] }) {
  const { toast } = useToast()
  const [propostas, setPropostas] = useState(iniciais)
  const [decidindo, setDecidindo] = useState<string | null>(null)

  async function decidir(proposta: PropostaPendente, eOMesmo: boolean) {
    setDecidindo(proposta.id)
    try {
      if (eOMesmo) await aprovarProposta(proposta.id)
      else await recusarProposta(proposta.id)
      setPropostas((prev) => prev.filter((p) => p.id !== proposta.id))
      toast(eOMesmo ? 'Conciliado' : 'Marcados como lançamentos diferentes')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível decidir', 'error')
    } finally {
      setDecidindo(null)
    }
  }

  if (propostas.length === 0) {
    return <p className="text-sm text-gray-600">Nenhuma conciliação esperando.</p>
  }

  const dia = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

  return (
    <ul className="space-y-3">
      {propostas.map((proposta) => (
        <li
          key={proposta.id}
          data-testid={`proposta-${proposta.id}`}
          className="rounded-lg border border-gray-200 p-4"
        >
          <div className="grid gap-1 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-gray-500">previsto · {dia(proposta.previsao.date)}</span>
              <span className="font-medium text-gray-900">{proposta.previsao.description}</span>
              <span className="shrink-0 font-semibold text-gray-900">
                {formatBRL(proposta.previsao.amountCents)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-gray-500">banco · {dia(proposta.realizado.date)}</span>
              <span className="font-medium text-gray-900">{proposta.realizado.description}</span>
              <span className="shrink-0 font-semibold text-gray-900">
                {formatBRL(proposta.realizado.amountCents)}
              </span>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {proposta.contaNome && <span>{proposta.contaNome} · </span>}
            {proposta.diasDeDiferenca === 0
              ? 'mesmo dia'
              : `${proposta.diasDeDiferenca} dia${proposta.diasDeDiferenca > 1 ? 's' : ''} de diferença`}
            {' · '}
            {proposta.diferencaCents === 0
              ? 'mesmo valor'
              : `${formatBRL(proposta.diferencaCents)} de diferença`}
          </p>

          <div className="mt-3 flex gap-2">
            <Button type="button" disabled={decidindo !== null} onClick={() => decidir(proposta, true)}>
              É o mesmo
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={decidindo !== null}
              onClick={() => decidir(proposta, false)}
            >
              São diferentes
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 5: Escreva a rota**

```tsx
// apps/web/app/(app)/transactions/matches/page.tsx
import { getOrgId } from '@/lib/finance/queries'
import { getPropostasPendentes } from '@/lib/finance/forecast-match-queries'
import { MatchProposalQueue } from '@/components/finance/match-proposal-queue'
import { PageHeader } from '@/components/ui/page-header'

export default async function MatchesPage() {
  const orgId = await getOrgId()
  const propostas = await getPropostasPendentes(orgId)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Conciliações"
        description="Pares que o floow encontrou entre a previsão e o que o banco trouxe. Nada é conciliado sem você aprovar."
      />
      <MatchProposalQueue propostas={propostas} />
    </div>
  )
}
```

- [ ] **Step 6: Rode e veja passar**

Run: `cd apps/web && npx vitest run __tests__/finance/fila-de-conciliacao.test.tsx`
Expected: PASS (8 testes)

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: sem saída

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/finance/forecast-match-queries.ts "apps/web/app/(app)/transactions/matches/page.tsx" apps/web/components/finance/match-proposal-queue.tsx apps/web/__tests__/finance/fila-de-conciliacao.test.tsx
git commit -m "feat(finance): fila de conciliacoes propostas

Mostra os dois lados do par e o porque dele — dias de diferenca e diferenca de
valor. \`matchForecast\` aceita 7 dias de janela e 8% de valor com palavra em
comum, entao o par plausivel e o errado chegam parecidos na tela: sem esses
dois numeros, \"e o mesmo?\" e pergunta sem informacao.

Sem aprovar todas, por desenho.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Item de menu com contador

**Files:**
- Modify: `apps/web/components/layout/sidebar.tsx` (NAV_SECTIONS seção "Dia a dia", ~linha 53-59; prop e badge ~114-161)
- Modify: `apps/web/components/layout/app-shell.tsx:8-13` (prop novo)
- Modify: `apps/web/app/(app)/layout.tsx:46-50` (passa a contagem)
- Create: `apps/web/lib/finance/forecast-match-badge.ts`
- Test: `apps/web/__tests__/finance/badge-de-conciliacao.test.tsx`

**Interfaces:**
- Consumes: `contarPropostasPendentes` (Task 4)
- Produces: `contagemDeConciliacoesPendentes(orgId: string): Promise<number>` (cacheada); prop `matchBadgeCount?: number` em `Sidebar` e `AppShell`

- [ ] **Step 1: Escreva o teste que falha**

```tsx
// apps/web/__tests__/finance/badge-de-conciliacao.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * O contador precisa aparecer no menu, senão a fila não bloqueante é uma tela
 * que ninguém lembra de visitar — e a previsão fica esperando decisão para
 * sempre.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
vi.mock('@/components/layout/sidebar-context', () => ({
  useSidebar: () => ({ pinned: true, setPinned: () => {}, hovered: false, setHovered: () => {} }),
}))

const { Sidebar } = await import('@/components/layout/sidebar')

describe('badge de conciliações no menu', () => {
  it('mostra o item e a contagem', () => {
    render(React.createElement(Sidebar, { matchBadgeCount: 7, mobileOpen: false, onMobileClose: () => {} }))

    screen.getByText('Conciliações')
    screen.getByText('7')
  })

  it('sem pendencia, nao mostra numero nenhum', () => {
    render(React.createElement(Sidebar, { matchBadgeCount: 0, mobileOpen: false, onMobileClose: () => {} }))

    screen.getByText('Conciliações')
    expect(screen.queryByText('0')).toBeNull()
  })
})
```

Se o mock de `sidebar-context` não corresponder à API real, leia `apps/web/components/layout/sidebar-context.tsx` e ajuste o mock ao que o hook devolve — não mude o componente para caber no teste.

- [ ] **Step 2: Rode e veja falhar**

Run: `cd apps/web && npx vitest run __tests__/finance/badge-de-conciliacao.test.tsx`
Expected: FAIL — não existe item "Conciliações" nem prop `matchBadgeCount`.

- [ ] **Step 3: Acrescente o item e o badge no sidebar**

Em `NAV_SECTIONS`, na seção `'Dia a dia'`, depois de Recorrentes:

```ts
      { href: '/transactions/matches', label: 'Conciliações', icon: GitCompareArrows },
```

`GitCompareArrows` vem de `lucide-react` — acrescente ao import existente.

O prop atravessa quatro lugares, os mesmos quatro do `cfoBadgeCount`:

Em `NavLink` (linha ~108), na desestruturação e no tipo:

```tsx
function NavLink({
  item,
  isActive,
  pinned,
  onClick,
  cfoBadgeCount,
  matchBadgeCount,
}: {
  item: NavItem
  isActive: boolean
  pinned: boolean
  onClick?: () => void
  cfoBadgeCount?: number
  matchBadgeCount?: number
}) {
```

Ainda em `NavLink`, depois do bloco do badge do `/cfo` (linha ~139-146):

```tsx
      {item.href === '/transactions/matches' && matchBadgeCount !== undefined && matchBadgeCount > 0 && (
        <span className={cn(
          'ml-auto rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 whitespace-nowrap',
          !pinned && FADE_IN,
        )}>
          {matchBadgeCount}
        </span>
      )}
```

Azul e não o vermelho do `/cfo`: vermelho no menu é alarme, e conciliação pendente não é alarme — a previsão não está em saldo nenhum enquanto espera.

Em `SidebarProps` e na assinatura (linhas ~153-161):

```tsx
interface SidebarProps {
  cfoBadgeCount?: number
  matchBadgeCount?: number
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ cfoBadgeCount, matchBadgeCount, mobileOpen, onMobileClose }: SidebarProps) {
```

E no `map` que renderiza os itens (linha ~287), ao lado do que já passa:

```tsx
                    cfoBadgeCount={cfoBadgeCount}
                    matchBadgeCount={matchBadgeCount}
```

- [ ] **Step 4: Alimente o contador**

```ts
// apps/web/lib/finance/forecast-match-badge.ts
import { unstable_cache } from 'next/cache'
import { transactionsTag } from '@/lib/cache-tags'
import { contarPropostasPendentes } from './forecast-match-queries'

/**
 * A contagem do badge, cacheada pela tag de transações.
 *
 * O `(app)/layout.tsx` roda em toda navegação do app, e hoje não faz consulta
 * nenhuma para o menu — `cfoBadgeCount` existe no `Sidebar` e ninguém o
 * alimenta. Sem cache, o badge custaria uma ida ao banco por página para
 * mostrar um número que muda poucas vezes por dia. O sync e as decisões da
 * fila já invalidam essa tag.
 */
export async function contagemDeConciliacoesPendentes(orgId: string): Promise<number> {
  return unstable_cache(
    async () => contarPropostasPendentes(orgId),
    ['conciliacoes-pendentes', orgId],
    { tags: [transactionsTag(orgId)], revalidate: 300 },
  )()
}
```

Em `app-shell.tsx`, o prop entra na interface (linha ~8-13) e é repassado ao `Sidebar` (linha ~27):

```tsx
interface AppShellProps {
  userEmail: string
  userName: string | null
  avatarUrl: string | null
  cfoBadgeCount?: number
  matchBadgeCount?: number
}

export function AppShell({ userEmail, userName, avatarUrl, cfoBadgeCount, matchBadgeCount }: AppShellProps) {
```

```tsx
      <Sidebar
        cfoBadgeCount={cfoBadgeCount}
        matchBadgeCount={matchBadgeCount}
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileClose}
      />
```

Em `(app)/layout.tsx`, a org vem do `gate` que o arquivo já resolve na linha 24 — `getReviewGateStatusSafe()` devolve `{ ok: true, orgId, blocked }` ou `{ ok: false }`, então o `gate.ok` é obrigatório para chegar no `orgId`. Depois do bloco `if (gate.ok && gate.blocked)` e antes do `return`:

```tsx
  // Sem org resolvida (o `gate` já falhou "para aberto"), o menu fica sem
  // número em vez de derrubar o layout: este arquivo não tem error boundary
  // próprio — ver o comentário de `getReviewGateStatusSafe`.
  const matchBadgeCount = gate.ok
    ? await contagemDeConciliacoesPendentes(gate.orgId)
    : undefined
```

E o import no topo:

```tsx
import { contagemDeConciliacoesPendentes } from '@/lib/finance/forecast-match-badge'
```

Passe ao `AppShell` (linha ~46):

```tsx
            <AppShell
              userEmail={user.email ?? ''}
              userName={meta.full_name ?? meta.name ?? null}
              avatarUrl={meta.avatar_url ?? meta.picture ?? null}
              matchBadgeCount={matchBadgeCount}
            />
```

- [ ] **Step 5: Rode e veja passar**

Run: `cd apps/web && npx vitest run __tests__/finance/badge-de-conciliacao.test.tsx`
Expected: PASS

Run: `cd apps/web && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: suíte verde, typecheck sem saída

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/layout/sidebar.tsx apps/web/components/layout/app-shell.tsx "apps/web/app/(app)/layout.tsx" apps/web/lib/finance/forecast-match-badge.ts apps/web/__tests__/finance/badge-de-conciliacao.test.tsx
git commit -m "feat(finance): item Conciliacoes no menu, com contador

Fila nao bloqueante sem contador e tela que ninguem lembra de visitar. A
contagem vai cacheada pela tag de transacoes: o layout roda em toda navegacao
e hoje nao consulta nada para o menu.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: O selo "conciliar?" na listagem

**Files:**
- Modify: `apps/web/lib/finance/queries-transactions.ts` (bloco `.select({...})` de `getTransactionsWithCount`, junto de `acquiredAssetId`)
- Modify: `apps/web/components/finance/transaction-list-types.ts` (campo novo)
- Modify: `apps/web/components/finance/transaction-display-row.tsx` (`ForecastBadge`)
- Test: `apps/web/__tests__/finance/selo-conciliar.test.tsx`

**Interfaces:**
- Consumes: `forecastMatchProposals` (Task 1)
- Produces: campo `hasPendingMatchProposal?: boolean` em `TransactionRowData`

- [ ] **Step 1: Escreva o teste que falha**

```tsx
// apps/web/__tests__/finance/selo-conciliar.test.tsx
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and } from 'drizzle-orm'
import { buildTransactionConditions } from '@/lib/finance/queries'

/**
 * O vermelho "não conciliado" significa "exige decisão sua". Com proposta
 * pendente a decisão existe e está na fila — manter o vermelho manda o usuário
 * procurar o que fazer no lugar errado.
 */

vi.mock('@/lib/finance/actions', () => ({}))

const { TransactionDesktopRow } = await import('@/components/finance/transaction-display-row')

const ACOES = {
  onToggleSelect: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onIgnore: vi.fn(),
  onToggleCashFlow: vi.fn(), onCancelRecurring: vi.fn(), onCreateRule: vi.fn(),
} as never

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-21T12:00:00-03:00'))
})
afterAll(() => { vi.useRealTimers() })

const VENCIDA = {
  id: 'tx-1', type: 'expense' as const, amountCents: -120000, description: 'Aluguel',
  date: '2026-09-01', accountId: 'conta-1', categoryName: null, categoryColor: null,
  categoryIcon: null, recurringTemplateId: 'tpl-1', balanceApplied: false,
  matchedTransactionId: null, externalId: null,
}

function renderRow(extra: Record<string, unknown> = {}) {
  render(
    React.createElement('table', null,
      React.createElement('tbody', null,
        React.createElement(TransactionDesktopRow, {
          tx: { ...VENCIDA, ...extra } as never,
          balance: 0, isSelected: false, loading: false, actions: ACOES,
        }))))
}

describe('selo da previsão vencida', () => {
  it('com proposta pendente, diz "conciliar?" e nao o vermelho', () => {
    renderRow({ hasPendingMatchProposal: true })

    screen.getByText('conciliar?')
    expect(screen.queryByText('não conciliado')).toBeNull()
  })

  it('sem proposta, segue o vermelho de sempre', () => {
    renderRow({ hasPendingMatchProposal: false })

    screen.getByText('não conciliado')
  })

  it('previsao ja conciliada nao muda', () => {
    renderRow({ matchedTransactionId: 'real-1', hasPendingMatchProposal: false })

    screen.getByText('conciliado')
  })

  it('o selo de conciliar leva a fila', () => {
    renderRow({ hasPendingMatchProposal: true })

    expect(screen.getByRole('link', { name: 'conciliar?' }).getAttribute('href'))
      .toBe('/transactions/matches')
  })
})

describe('o recorte da listagem não muda', () => {
  it('proposta pendente não entra no WHERE da lista', () => {
    const dialect = new PgDialect()
    const sql = dialect.sqlToQuery(and(...buildTransactionConditions('org-1'))!).sql.toLowerCase()

    expect(sql).not.toContain('forecast_match_proposals')
  })
})
```

- [ ] **Step 2: Rode e veja falhar**

Run: `cd apps/web && npx vitest run __tests__/finance/selo-conciliar.test.tsx`
Expected: FAIL — o selo "conciliar?" não existe.

- [ ] **Step 3: Traga o dado na consulta**

Em `getTransactionsWithCount`, dentro do `.select({ ... })`, ao lado de `acquiredAssetId`:

```ts
      /**
       * Existe proposta de conciliação esperando decisão para esta previsão.
       *
       * Subquery e não join: a proposta é 0-ou-1 por previsão (índice único
       * parcial da 00047), mas um join a mais nesta consulta duplicaria linha
       * se aquela garantia caísse, e linha duplicada corrompe o
       * `count(*) over ()` e o saldo acumulado.
       */
      hasPendingMatchProposal: sql<boolean>`exists (
        select 1 from ${forecastMatchProposals}
         where ${forecastMatchProposals.forecastTransactionId} = ${transactions.id}
           and ${forecastMatchProposals.orgId} = ${orgId}
           and ${forecastMatchProposals.status} = 'pending')`,
```

Import a acrescentar: `forecastMatchProposals` de `@floow/db`.

Em `transaction-list-types.ts`, no `TransactionRowData`:

```ts
  /**
   * Ha proposta de conciliacao esperando decisao para esta previsao. Muda o
   * selo: o vermelho "nao conciliado" quer dizer "exige decisao sua", e com
   * proposta aberta a decisao esta na fila.
   */
  hasPendingMatchProposal?: boolean
```

- [ ] **Step 4: Acrescente o selo**

Em `ForecastBadge` (`transaction-display-row.tsx`), antes do ramo que devolve "não conciliado":

```tsx
  if (tx.hasPendingMatchProposal) {
    return (
      <Link
        href="/transactions/matches"
        className="inline-flex shrink-0 items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100"
        title="O floow encontrou um lançamento do banco que pode ser este. Decida na fila de conciliações."
      >
        conciliar?
      </Link>
    )
  }
```

`Link` já está importado no arquivo (usado por `AcquiredAssetBadge`).

- [ ] **Step 5: Rode e veja passar**

Run: `cd apps/web && npx vitest run __tests__/finance/selo-conciliar.test.tsx`
Expected: PASS (5 testes)

Run: `cd apps/web && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: suíte verde, typecheck sem saída

- [ ] **Step 6: Build de produção**

Run: `cd /c/DEV/floow && npx turbo build`
Expected: `1 successful`

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/finance/queries-transactions.ts apps/web/components/finance/transaction-list-types.ts apps/web/components/finance/transaction-display-row.tsx apps/web/__tests__/finance/selo-conciliar.test.tsx
git commit -m "feat(finance): previsao com proposta aberta mostra \"conciliar?\"

O vermelho \"nao conciliado\" quer dizer \"exige decisao sua\". Com proposta
pendente a decisao existe e esta na fila — manter o vermelho manda o usuario
procurar o que fazer no lugar errado. O selo novo leva a /transactions/matches.

Subquery e nao join: linha duplicada corromperia o count(*) over () e o saldo
acumulado da listagem.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Depois de executar

Aplique a migration no banco antes de considerar a feature no ar: `00047` cria a tabela de que todas as consultas dependem, e o app sobe sem ela (a tabela só é lida) até alguém abrir a fila. Ordem segura de deploy: migration primeiro, código depois.

Não há backfill. Os casamentos já feitos continuam valendo; o gate vale do deploy para frente (spec §4).
