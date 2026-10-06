# Conciliação v1 — Entrega 1 (medição) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar toda decisão de categoria numa tabela `validacoes`, semeada com 24 meses de histórico, e medir quanto o palpite atual acerta — sem mudar nenhuma tela.

**Architecture:** Migration 00074 cria `validacoes` e semeia `legado`. Um módulo único (`lib/finance/conciliacao/validacoes.ts`) concentra as leituras e o INSERT; cada ponto de decisão chama esse módulo dentro da transação que já existe. Os testes das ações mockam esse módulo, então as filas de `select` dos mocks atuais não mudam.

**Tech Stack:** Next.js server actions, Drizzle ORM, Postgres (Supabase), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-conciliacao-v1-validacao-assistida-design.md`

## Global Constraints

- Nenhum arquivo passa de 500 linhas (CLAUDE.md).
- Entidade = `counterparty_id`. Escopo por org.
- `acao` ∈ `confirmar | corrigir | regra | vinculo | edicao | legado`.
- `sugestao_origem` ∈ `historico | claude` ou nulo.
- Semeadura: lançamentos `confirmed`, não ignorados, com `counterparty_id`, `date >= now() - interval '24 months'`.
- O evento vai na mesma transação da decisão: se o INSERT falha, a decisão falha junto. É o que garante que toda decisão tem registro, e por isso a migration vai ANTES do deploy.
- Módulos novos não chamam `getDb()` (catraca `__tests__/auth/rls-ledger.test.ts`); recebem o `tx`. Tipo: `type Db = ReturnType<typeof getDb>` com `import { type getDb }`.
- Mensagens, comentários e nomes em português, no estilo dos arquivos vizinhos.

## Review Focus

- Transferência (categoria nula) decidida pelo card: evento com `categoria_id` nulo e `acao = corrigir` mesmo sem sugestão — testado na Task 2.
- Lote de `confirmCounterparty` com exceções: cada lançamento gera um evento com a SUA categoria final, não a do grupo — testado na Task 2 (`registrarDecisoes` lê a linha depois do UPDATE).
- Lançamento que já não estava pendente (clique duplo): não gera evento — testado na Task 2 (filtra `review_state = confirmed` entre os ids capturados como pendentes).
- Migration rodada duas vezes: não duplica `legado` — índice único parcial, verificado na Task 1.
- `updateTransaction` sem mudar a categoria (só valor ou data): não gera `edicao` — testado na Task 5.

---

### Task 1: Tabela `validacoes` e semeadura

**Files:**
- Create: `supabase/migrations/00074_validacoes.sql`
- Create: `packages/db/src/schema/validacoes.ts`
- Modify: `packages/db/src/index.ts` (export)
- Test: `packages/db/src/__tests__/finance-schema.test.ts`

**Interfaces:**
- Produces: `validacoes` (Drizzle) com `id, orgId, transactionId, counterpartyId, userId, acao, sugestaoCategoriaId, sugestaoOrigem, natureza, categoriaId, createdAt`; tipo `AcaoDeValidacao`.

- [ ] **Step 1: Teste do schema (falha)**

Acrescentar ao fim de `packages/db/src/__tests__/finance-schema.test.ts`:

```ts
describe('validacoes', () => {
  it('tem as colunas do evento', async () => {
    const { validacoes } = await import('../schema/validacoes')
    const cols = validacoes as any
    expect(cols.transactionId.name).toBe('transaction_id')
    expect(cols.counterpartyId.notNull).toBe(false)
    expect(cols.userId.notNull).toBe(false)
    expect(cols.acao.notNull).toBe(true)
    expect(cols.sugestaoCategoriaId.name).toBe('sugestao_categoria_id')
    expect(cols.natureza.notNull).toBe(true)
    expect(cols.categoriaId.notNull).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd packages/db && npx vitest run src/__tests__/finance-schema.test.ts`
Expected: FAIL, módulo `../schema/validacoes` não existe.

- [ ] **Step 3: Schema Drizzle**

`packages/db/src/schema/validacoes.ts`:

```ts
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { orgs } from './auth'
import { transactions, categories } from './finance'
import { counterparties } from './counterparty'

export type AcaoDeValidacao = 'confirmar' | 'corrigir' | 'regra' | 'vinculo' | 'edicao' | 'legado'

/** Uma decisão de categoria sobre um lançamento. Ver migration 00074. */
export const validacoes = pgTable(
  'validacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    counterpartyId: uuid('counterparty_id').references(() => counterparties.id, { onDelete: 'set null' }),
    userId: uuid('user_id'),
    acao: text('acao').$type<AcaoDeValidacao>().notNull(),
    sugestaoCategoriaId: uuid('sugestao_categoria_id').references(() => categories.id, { onDelete: 'set null' }),
    sugestaoOrigem: text('sugestao_origem').$type<'historico' | 'claude'>(),
    natureza: text('natureza').$type<'income' | 'expense' | 'transfer'>().notNull(),
    categoriaId: uuid('categoria_id').references(() => categories.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    porContraparte: index('idx_validacoes_contraparte').on(t.orgId, t.counterpartyId, t.createdAt),
  }),
)
```

Conferir os caminhos de import de `orgs`, `transactions`, `categories` e `counterparties` em `packages/db/src/schema/` antes (o `orgs` pode estar em `auth.ts`). Em `packages/db/src/index.ts`, ao lado de `export * from './schema/llm-usage'`:

```ts
export * from './schema/validacoes'
```

- [ ] **Step 4: Migration**

`supabase/migrations/00074_validacoes.sql`:

```sql
-- =============================================================================
-- validacoes: toda decisão de categoria vira um registro
-- -----------------------------------------------------------------------------
-- Entrega 1 da Conciliação v1 (docs/superpowers/specs/
-- 2026-10-06-conciliacao-v1-validacao-assistida-design.md). Mede quanto o
-- palpite acerta antes de qualquer automação nova.
--
-- APLICAR ANTES DO DEPLOY: o código grava o evento na mesma transação da
-- decisão; sem a tabela, classificar no card falha.
-- Rollback do código: o antigo ignora a tabela.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.validacoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  transaction_id        uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  counterparty_id       uuid REFERENCES public.counterparties(id) ON DELETE SET NULL,
  user_id               uuid,
  acao                  text NOT NULL CHECK (acao IN ('confirmar','corrigir','regra','vinculo','edicao','legado')),
  sugestao_categoria_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  sugestao_origem       text CHECK (sugestao_origem IN ('historico','claude')),
  natureza              text NOT NULL CHECK (natureza IN ('income','expense','transfer')),
  categoria_id          uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_validacoes_contraparte
  ON public.validacoes (org_id, counterparty_id, created_at);

-- Semeadura uma vez só por lançamento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_validacoes_legado
  ON public.validacoes (transaction_id) WHERE acao = 'legado';

ALTER TABLE public.validacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "validacoes: members can select" ON public.validacoes;
CREATE POLICY "validacoes: members can select"
  ON public.validacoes FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- 24 meses de decisões já tomadas. created_at = data do lançamento, para a
-- janela de 30 dias das métricas não tratar o histórico como recente.
INSERT INTO public.validacoes (org_id, transaction_id, counterparty_id, acao, natureza, categoria_id, created_at)
SELECT t.org_id, t.id, t.counterparty_id, 'legado', t.type::text, t.category_id, t.date::timestamptz
FROM public.transactions t
WHERE t.review_state = 'confirmed'
  AND t.is_ignored = false
  AND t.counterparty_id IS NOT NULL
  AND t.date >= now() - interval '24 months'
ON CONFLICT (transaction_id) WHERE acao = 'legado' DO NOTHING;
```

- [ ] **Step 5: Rodar o teste**

Run: `cd packages/db && npx vitest run src/__tests__/finance-schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Conferir a migration no banco real, com ROLLBACK**

O `.env.local` aponta para produção (ver memória "Dev local grava em prod"). Rodar dentro de transação e desfazer:

```bash
cd apps/web && node -e "
require('dotenv').config({path:'.env.local'});
const fs=require('fs');const postgres=require('postgres');
const sql=postgres(process.env.DATABASE_URL,{max:1});
const ddl=fs.readFileSync('../../supabase/migrations/00074_validacoes.sql','utf8');
sql.begin(async (tx)=>{await tx.unsafe(ddl);await tx.unsafe(ddl);
 const [r]=await tx\`select count(*)::int n, count(distinct transaction_id)::int d from validacoes where acao='legado'\`;
 console.log(r);throw new Error('ROLLBACK proposital')}).catch(e=>console.log(e.message)).finally(()=>sql.end())"
```

Expected: `{ n: X, d: X }` (mesmo número: rodar duas vezes não duplica), depois `ROLLBACK proposital`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/00074_validacoes.sql packages/db/src/schema/validacoes.ts packages/db/src/index.ts packages/db/src/__tests__/finance-schema.test.ts
git commit -m "feat(validacoes): tabela de decisões de categoria e semeadura de 24 meses"
```

---

### Task 2: Módulo `validacoes.ts`

**Files:**
- Create: `apps/web/lib/finance/conciliacao/validacoes.ts`
- Test: `apps/web/__tests__/finance/validacoes.test.ts`

**Interfaces:**
- Consumes: `validacoes`, `AcaoDeValidacao` (Task 1).
- Produces:
  - `acaoDoUsuario(sugestaoCategoriaId: string | null, categoriaFinal: string | null): 'confirmar' | 'corrigir'`
  - `type Captura = { counterpartyId: string; sugestao: { categoriaId: string | null; origem: 'historico' | 'claude' | null }; ids: string[] }`
  - `capturarPendentes(tx: Db, orgId: string, counterpartyId: string, somenteIds?: string[]): Promise<Captura>`
  - `registrarDecisoes(tx: Db, orgId: string, captura: Captura, userId: string | null): Promise<number>`
  - `type EventoNovo = { transactionId: string; counterpartyId: string | null; natureza: 'income' | 'expense' | 'transfer'; categoriaId: string | null }`
  - `registrarEventos(tx: Db, orgId: string, acao: AcaoDeValidacao, userId: string | null, eventos: EventoNovo[]): Promise<void>`

- [ ] **Step 1: Testes (falham)**

`apps/web/__tests__/finance/validacoes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { acaoDoUsuario, capturarPendentes, registrarDecisoes, registrarEventos } from '@/lib/finance/conciliacao/validacoes'

const selectQueue: unknown[][] = []
const inserts: Record<string, unknown>[][] = []
function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit']) c[m] = () => chain(result)
  return c
}
const tx: any = {
  select: () => chain(selectQueue.shift() ?? []),
  insert: () => ({ values: (v: Record<string, unknown>[]) => { inserts.push(v); return Promise.resolve() } }),
}
beforeEach(() => { selectQueue.length = 0; inserts.length = 0 })

describe('acaoDoUsuario', () => {
  it('aceitou o palpite', () => expect(acaoDoUsuario('cat-1', 'cat-1')).toBe('confirmar'))
  it('trocou o palpite', () => expect(acaoDoUsuario('cat-1', 'cat-2')).toBe('corrigir'))
  it('sem palpite é sempre corrigir', () => expect(acaoDoUsuario(null, 'cat-2')).toBe('corrigir'))
  it('transferência (categoria nula) sem palpite é corrigir', () => expect(acaoDoUsuario(null, null)).toBe('corrigir'))
})

describe('capturarPendentes', () => {
  it('lê o palpite da contraparte e os pendentes', async () => {
    selectQueue.push([{ categoriaId: 'cat-1', origem: 'historico' }], [{ id: 't1' }, { id: 't2' }])
    expect(await capturarPendentes(tx, 'org-1', 'cp-1')).toEqual({
      counterpartyId: 'cp-1', sugestao: { categoriaId: 'cat-1', origem: 'historico' }, ids: ['t1', 't2'],
    })
  })
  it('contraparte sem palpite', async () => {
    selectQueue.push([{ categoriaId: null, origem: null }], [{ id: 't1' }])
    expect((await capturarPendentes(tx, 'org-1', 'cp-1')).sugestao).toEqual({ categoriaId: null, origem: null })
  })
})

describe('registrarDecisoes', () => {
  const captura = { counterpartyId: 'cp-1', sugestao: { categoriaId: 'cat-1', origem: 'claude' as const }, ids: ['t1', 't2', 't3'] }
  it('um evento por lançamento que saiu confirmado, com a categoria final de cada um', async () => {
    // t3 continua pendente (clique duplo, ou ficou fora do lote): sem evento.
    selectQueue.push([
      { id: 't1', type: 'expense', categoryId: 'cat-1' },
      { id: 't2', type: 'expense', categoryId: 'cat-9' },
    ])
    expect(await registrarDecisoes(tx, 'org-1', captura, 'user-1')).toBe(2)
    expect(inserts[0]).toEqual([
      expect.objectContaining({ transactionId: 't1', acao: 'confirmar', categoriaId: 'cat-1', sugestaoCategoriaId: 'cat-1', sugestaoOrigem: 'claude', userId: 'user-1', counterpartyId: 'cp-1', natureza: 'expense' }),
      expect.objectContaining({ transactionId: 't2', acao: 'corrigir', categoriaId: 'cat-9' }),
    ])
  })
  it('nada confirmado: não insere', async () => {
    selectQueue.push([])
    expect(await registrarDecisoes(tx, 'org-1', captura, 'user-1')).toBe(0)
    expect(inserts).toHaveLength(0)
  })
  it('captura vazia: nem consulta', async () => {
    expect(await registrarDecisoes(tx, 'org-1', { ...captura, ids: [] }, 'user-1')).toBe(0)
  })
})

describe('registrarEventos', () => {
  it('grava a ação fixa sem palpite', async () => {
    await registrarEventos(tx, 'org-1', 'regra', null, [{ transactionId: 't1', counterpartyId: 'cp-1', natureza: 'income', categoriaId: 'cat-3' }])
    expect(inserts[0]).toEqual([{ orgId: 'org-1', transactionId: 't1', counterpartyId: 'cp-1', userId: null, acao: 'regra', natureza: 'income', categoriaId: 'cat-3' }])
  })
  it('lista vazia: não insere', async () => {
    await registrarEventos(tx, 'org-1', 'regra', null, [])
    expect(inserts).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run __tests__/finance/validacoes.test.ts`
Expected: FAIL, módulo não existe.

- [ ] **Step 3: Implementação**

`apps/web/lib/finance/conciliacao/validacoes.ts`:

```ts
import { and, eq, inArray } from 'drizzle-orm'
import { counterparties, transactions, validacoes, type AcaoDeValidacao, type getDb } from '@floow/db'

type Db = ReturnType<typeof getDb>
type Natureza = 'income' | 'expense' | 'transfer'

/**
 * Toda decisão de categoria vira um registro em `validacoes` (spec
 * 2026-10-06, Entrega 1). Grava na MESMA transação da decisão: decisão sem
 * registro não existe, senão a medição mente.
 */

/** Aceitou o palpite ou escolheu outra coisa. Sem palpite, é sempre escolha. */
export function acaoDoUsuario(sugestaoCategoriaId: string | null, categoriaFinal: string | null): 'confirmar' | 'corrigir' {
  return sugestaoCategoriaId !== null && sugestaoCategoriaId === categoriaFinal ? 'confirmar' : 'corrigir'
}

export type Captura = {
  counterpartyId: string
  sugestao: { categoriaId: string | null; origem: 'historico' | 'claude' | null }
  ids: string[]
}

/**
 * O palpite e os pendentes ANTES de aplicar a decisão: depois do UPDATE não
 * dá mais para saber quem estava pendente nem o que o card mostrava.
 */
export async function capturarPendentes(tx: Db, orgId: string, counterpartyId: string, somenteIds?: string[]): Promise<Captura> {
  const [cp] = await tx
    .select({ categoriaId: counterparties.suggestedCategoryId, origem: counterparties.suggestionSource })
    .from(counterparties)
    .where(and(eq(counterparties.id, counterpartyId), eq(counterparties.orgId, orgId)))
    .limit(1)
  const condicoes = [eq(transactions.orgId, orgId), eq(transactions.counterpartyId, counterpartyId), eq(transactions.reviewState, 'pending')]
  if (somenteIds) condicoes.push(inArray(transactions.id, somenteIds))
  const pendentes = somenteIds?.length === 0 ? [] : await tx.select({ id: transactions.id }).from(transactions).where(and(...condicoes))
  return {
    counterpartyId,
    sugestao: { categoriaId: cp?.categoriaId ?? null, origem: cp?.origem ?? null },
    ids: pendentes.map((p) => p.id),
  }
}

/** Um evento por lançamento capturado que saiu confirmado, com a categoria final DELE (exceções do lote incluídas). */
export async function registrarDecisoes(tx: Db, orgId: string, captura: Captura, userId: string | null): Promise<number> {
  if (captura.ids.length === 0) return 0
  const decididos = await tx
    .select({ id: transactions.id, type: transactions.type, categoryId: transactions.categoryId })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), inArray(transactions.id, captura.ids), eq(transactions.reviewState, 'confirmed')))
  if (decididos.length === 0) return 0
  await tx.insert(validacoes).values(decididos.map((d) => ({
    orgId,
    transactionId: d.id,
    counterpartyId: captura.counterpartyId,
    userId,
    acao: acaoDoUsuario(captura.sugestao.categoriaId, d.categoryId),
    sugestaoCategoriaId: captura.sugestao.categoriaId,
    sugestaoOrigem: captura.sugestao.origem,
    natureza: d.type as Natureza,
    categoriaId: d.categoryId,
  })))
  return decididos.length
}

export type EventoNovo = { transactionId: string; counterpartyId: string | null; natureza: Natureza; categoriaId: string | null }

/** Decisão sem palpite a comparar: regra aplicada no sync, categoria herdada da previsão, edição fora da fila. */
export async function registrarEventos(tx: Db, orgId: string, acao: AcaoDeValidacao, userId: string | null, eventos: EventoNovo[]): Promise<void> {
  if (eventos.length === 0) return
  await tx.insert(validacoes).values(eventos.map((e) => ({ orgId, ...e, userId, acao })))
}
```

- [ ] **Step 4: Rodar os testes**

Run: `cd apps/web && npx vitest run __tests__/finance/validacoes.test.ts __tests__/auth/rls-ledger.test.ts`
Expected: PASS (a catraca não acusa o arquivo novo, que não chama `getDb()`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/finance/conciliacao/validacoes.ts apps/web/__tests__/finance/validacoes.test.ts
git commit -m "feat(validacoes): captura do palpite e registro das decisões"
```

---

### Task 3: Decisões no card e nas regras

**Files:**
- Modify: `apps/web/lib/openfinance/counterparty-actions.ts` (`confirmCounterparty`)
- Modify: `apps/web/lib/finance/conciliacao/vincular-actions.ts` (`classificarSoEste`)
- Modify: `apps/web/lib/openfinance/corrigir-regra-actions.ts` (`corrigirRegra`)
- Test: `apps/web/__tests__/openfinance/counterparty-actions.test.ts`, `apps/web/__tests__/finance/acoes-do-card.test.ts`, `apps/web/__tests__/openfinance/corrigir-regra-actions.test.ts`

**Interfaces:**
- Consumes: `capturarPendentes`, `registrarDecisoes` (Task 2).

- [ ] **Step 1: Testes (falham)**

Em cada um dos três arquivos de teste, junto dos outros `vi.mock`:

```ts
vi.mock('@/lib/finance/conciliacao/validacoes', () => ({
  capturarPendentes: vi.fn(async (_tx: unknown, _org: string, counterpartyId: string, somenteIds?: string[]) => ({
    counterpartyId, sugestao: { categoriaId: null, origem: null }, ids: somenteIds ?? ['pendente-1'],
  })),
  registrarDecisoes: vi.fn(async () => 1),
}))
```

e importar depois dos mocks: `const { capturarPendentes, registrarDecisoes } = await import('@/lib/finance/conciliacao/validacoes')`.

`counterparty-actions.test.ts`, num caso de sucesso já existente (o primeiro que chama `confirmCounterparty` e espera `reclassified`), acrescentar:

```ts
expect(capturarPendentes).toHaveBeenCalledWith(expect.anything(), ORG, COUNTERPARTY_ID)
expect(registrarDecisoes).toHaveBeenCalledWith(expect.anything(), ORG, expect.objectContaining({ counterpartyId: COUNTERPARTY_ID }), expect.any(String))
```

`acoes-do-card.test.ts`, no caso de sucesso de `classificarSoEste`:

```ts
expect(capturarPendentes).toHaveBeenCalledWith(expect.anything(), 'org-1', expect.any(String), [expect.any(String)])
expect(registrarDecisoes).toHaveBeenCalled()
```

(se o arquivo não mocka `@/lib/auth/session`, acrescentar `vi.mock('@/lib/auth/session', () => ({ requireIdentity: async () => ({ userId: 'user-1' }) }))`.)

`corrigir-regra-actions.test.ts`, num caso com `aplicarAoHistorico: true` que reprocessa:

```ts
expect(registrarDecisoes).toHaveBeenCalled()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run __tests__/openfinance/counterparty-actions.test.ts __tests__/finance/acoes-do-card.test.ts __tests__/openfinance/corrigir-regra-actions.test.ts`
Expected: FAIL nas novas asserções (`capturarPendentes` não chamado).

- [ ] **Step 3: `confirmCounterparty`**

Em `counterparty-actions.ts`, importar `import { capturarPendentes, registrarDecisoes } from '@/lib/finance/conciliacao/validacoes'`. Dentro da transação, logo depois do `if (!row) throw ...`:

```ts
    // O palpite e os pendentes antes de a decisão sobrescrevê-los.
    const captura = await capturarPendentes(tx as unknown as Db, orgId, input.counterpartyId)
```

e, depois de `aplicarDecisaoAosPendentes(...)`, antes do `return reclassifiedCount`:

```ts
    await registrarDecisoes(tx as unknown as Db, orgId, captura, userId)
```

- [ ] **Step 4: `classificarSoEste`**

Em `vincular-actions.ts`, importar `capturarPendentes`, `registrarDecisoes` e `requireIdentity` (`@/lib/auth/session`). Antes do `db.transaction`: `const { userId } = await requireIdentity()`. Dentro da transação, trocar o `return aplicarDecisaoAosPendentes(...)` por:

```ts
      const captura = await capturarPendentes(tx as unknown as Db, orgId, input.counterpartyId, [input.transactionId])
      const n = await aplicarDecisaoAosPendentes(
        tx as unknown as Db, orgId,
        { counterpartyId: input.counterpartyId, nature: input.nature, categoryId: input.categoryId, transferAccountId: input.transferAccountId, exceptions: [] },
        contasParaConciliar, [input.transactionId],
      )
      await registrarDecisoes(tx as unknown as Db, orgId, captura, userId)
      return n
```

- [ ] **Step 5: `corrigirRegra`**

Em `corrigir-regra-actions.ts`, importar `capturarPendentes`, `registrarDecisoes`. No bloco `if (aplicarAoHistorico)` que chama `aplicarDecisaoAosPendentes`, capturar ANTES (os desfeitos já voltaram a `pending` por `desfazerParDaRegra`) e registrar depois:

```ts
    if (aplicarAoHistorico) {
      const reaplicar = desfeitos.filter((id) => !devolvidos.has(id))
      const captura = await capturarPendentes(tx, orgId, input.counterpartyId, reaplicar)
      await aplicarDecisaoAosPendentes(
        tx,
        orgId,
        { counterpartyId: input.counterpartyId, nature: input.nature, categoryId: input.categoryId, transferAccountId: conta, exceptions: [] },
        contasParaConciliar,
        reaplicar,
      )
      await registrarDecisoes(tx, orgId, captura, userId)
    }
```

(manter os comentários existentes do bloco.)

- [ ] **Step 6: Rodar os testes**

Run: `cd apps/web && npx vitest run __tests__/openfinance __tests__/finance/acoes-do-card.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/openfinance/counterparty-actions.ts apps/web/lib/finance/conciliacao/vincular-actions.ts apps/web/lib/openfinance/corrigir-regra-actions.ts apps/web/__tests__/openfinance/counterparty-actions.test.ts apps/web/__tests__/finance/acoes-do-card.test.ts apps/web/__tests__/openfinance/corrigir-regra-actions.test.ts
git commit -m "feat(validacoes): card e regras registram cada decisão"
```

---

### Task 4: Regra aplicada no sync e categoria herdada da previsão

**Files:**
- Modify: `apps/web/lib/openfinance/persist-page.ts:274-278`
- Modify: `apps/web/lib/finance/conciliacao/vincular-db.ts` (ramo que herda a categoria da previsão)
- Test: `apps/web/__tests__/openfinance/sync-persist.test.ts`, `apps/web/__tests__/finance/vincular-previsao.test.ts`

**Interfaces:**
- Consumes: `registrarEventos` (Task 2).

- [ ] **Step 1: Testes (falham)**

Nos dois arquivos, mockar o módulo:

```ts
vi.mock('@/lib/finance/conciliacao/validacoes', () => ({ registrarEventos: vi.fn(async () => {}) }))
```

`vincular-previsao.test.ts`, no caso "grava o vínculo, herda a categoria da previsão e decide as propostas":

```ts
expect(registrarEventos).toHaveBeenCalledWith(tx, 'org-1', 'vinculo', null, [
  { transactionId: 'real-1', counterpartyId: null, natureza: 'expense', categoriaId: 'cat-9' },
])
```

e no caso "realizado já confirmado: nada a classificar": `expect(registrarEventos).not.toHaveBeenCalled()`.

`sync-persist.test.ts`: num caso que insere linhas novas, fazer o `returning` do insert devolver uma linha com `counterpartyId: 'cp-1', reviewState: 'confirmed', type: 'expense', categoryId: 'cat-1'` e outra com `reviewState: 'pending'`, e conferir:

```ts
expect(registrarEventos).toHaveBeenCalledWith(expect.anything(), ORG, 'regra', null, [
  { transactionId: expect.any(String), counterpartyId: 'cp-1', natureza: 'expense', categoriaId: 'cat-1' },
])
```

(adaptar ao formato do mock de `returning` que o arquivo já usa.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run __tests__/openfinance/sync-persist.test.ts __tests__/finance/vincular-previsao.test.ts`
Expected: FAIL.

- [ ] **Step 3: `persistPage`**

Importar `import { registrarEventos } from '@/lib/finance/conciliacao/validacoes'`. Trocar o `returning` do insert principal e registrar logo depois:

```ts
      .returning({
        id: transactions.id, amountCents: transactions.amountCents, applied: transactions.balanceApplied,
        counterpartyId: transactions.counterpartyId, reviewState: transactions.reviewState,
        type: transactions.type, categoryId: transactions.categoryId,
      })

    // Contraparte confirmada decidiu sozinha: a regra do usuário, aplicada.
    await registrarEventos(dbTx as unknown as Db, input.orgId, 'regra', null, inserted
      .filter((r) => r.counterpartyId !== null && r.reviewState === 'confirmed')
      .map((r) => ({ transactionId: r.id, counterpartyId: r.counterpartyId, natureza: r.type, categoriaId: r.categoryId })))
```

(se o arquivo não tiver `type Db = ReturnType<typeof getDb>`, acrescentar.)

- [ ] **Step 4: `vincularNoBanco`**

Importar `registrarEventos`. Selecionar também `counterpartyId: transactions.counterpartyId` nas pontas. No ramo `else if (realizado.reviewState === 'pending' && previsao.type !== 'transfer' && previsao.categoryId)`, depois do UPDATE do realizado:

```ts
    await registrarEventos(tx, orgId, 'vinculo', null, [
      { transactionId: realizadoId, counterpartyId: realizado.counterpartyId ?? null, natureza: previsao.type, categoriaId: previsao.categoryId },
    ])
```

- [ ] **Step 5: Rodar os testes**

Run: `cd apps/web && npx vitest run __tests__/openfinance __tests__/finance`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/openfinance/persist-page.ts apps/web/lib/finance/conciliacao/vincular-db.ts apps/web/__tests__/openfinance/sync-persist.test.ts apps/web/__tests__/finance/vincular-previsao.test.ts
git commit -m "feat(validacoes): regra aplicada no sync e categoria herdada da previsão"
```

---

### Task 5: Edição de categoria fora da fila

**Files:**
- Modify: `apps/web/lib/finance/transaction-actions.ts` (`updateTransaction`, `bulkCategorizeTransactions`)
- Test: o arquivo que já testa `updateTransaction` (achar com `grep -rln "updateTransaction" apps/web/__tests__`); criar `apps/web/__tests__/finance/edicao-registra-validacao.test.ts` se não houver um adequado.

**Interfaces:**
- Consumes: `registrarEventos` (Task 2).

- [ ] **Step 1: Testes (falham)**

Com o mesmo `vi.mock('@/lib/finance/conciliacao/validacoes', () => ({ registrarEventos: vi.fn(async () => {}) }))`:

```ts
it('trocar a categoria de um lançamento confirmado registra edicao', async () => {
  // oldTx: confirmed, categoryId 'cat-1', counterpartyId 'cp-1', type 'expense'; form com categoryId 'cat-2'
  await updateTransaction(form({ categoryId: 'cat-2' }))
  expect(registrarEventos).toHaveBeenCalledWith(expect.anything(), 'org-1', 'edicao', null, [
    { transactionId: TX_ID, counterpartyId: 'cp-1', natureza: 'expense', categoriaId: 'cat-2' },
  ])
})
it('mudar só valor ou data não registra', async () => {
  await updateTransaction(form({ categoryId: 'cat-1' }))
  expect(registrarEventos).not.toHaveBeenCalled()
})
it('bulkCategorize registra uma edicao por lançamento', async () => {
  // returning do UPDATE: [{ id: 'a', counterpartyId: 'cp-1', type: 'expense' }, { id: 'b', counterpartyId: null, type: 'expense' }]
  await bulkCategorizeTransactions(['a', 'b'], 'cat-5')
  expect(registrarEventos).toHaveBeenCalledWith(expect.anything(), 'org-1', 'edicao', null, [
    { transactionId: 'a', counterpartyId: 'cp-1', natureza: 'expense', categoriaId: 'cat-5' },
    { transactionId: 'b', counterpartyId: null, natureza: 'expense', categoriaId: 'cat-5' },
  ])
})
```

(`form()` e o mock de `getDb` seguem o padrão do arquivo de teste existente.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run <arquivo>`
Expected: FAIL.

- [ ] **Step 3: Implementação**

Em `transaction-actions.ts`, importar `registrarEventos`. Em `updateTransaction`, dentro da transação, depois do UPDATE da linha:

```ts
    // Edição de categoria é decisão do usuário: entra na medição.
    const categoriaNova = convertendoEmTransferencia ? null : (input.categoryId ?? null)
    if (oldTx.reviewState === 'confirmed' && oldTx.categoryId !== categoriaNova) {
      await registrarEventos(tx as unknown as Db, orgId, 'edicao', null, [
        { transactionId: input.id, counterpartyId: oldTx.counterpartyId, natureza: input.type, categoriaId: categoriaNova },
      ])
    }
```

Em `bulkCategorizeTransactions`:

```ts
  const editados = await db
    .update(transactions)
    .set({ categoryId, isAutoCategorized: false })
    .where(and(inArray(transactions.id, ids), eq(transactions.orgId, orgId)))
    .returning({ id: transactions.id, counterpartyId: transactions.counterpartyId, type: transactions.type })

  await registrarEventos(db, orgId, 'edicao', null, editados.map((e) => ({
    transactionId: e.id, counterpartyId: e.counterpartyId, natureza: e.type, categoriaId: categoryId,
  })))
```

Conferir que `transaction-actions.ts` continua abaixo de 500 linhas (`wc -l`).

- [ ] **Step 4: Rodar os testes**

Run: `cd apps/web && npx vitest run __tests__/finance`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/finance/transaction-actions.ts apps/web/__tests__/finance/<arquivo>
git commit -m "feat(validacoes): edição de categoria fora da fila entra na medição"
```

---

### Task 6: Script de acerto e verificação final

**Files:**
- Create: `scripts/acerto-da-sugestao.mts`

- [ ] **Step 1: Script (só leitura)**

```ts
#!/usr/bin/env -S npx tsx
// scripts/acerto-da-sugestao.mts
/**
 * Só leitura. Quanto o palpite da fila acerta (spec 2026-10-06, Entrega 1):
 * entre as decisões do usuário com palpite, a fração que aceitou o palpite.
 * Por origem e pelas 20 contrapartes com mais decisões. Janela em dias no
 * primeiro argumento (padrão 30).
 *
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/acerto-da-sugestao.mts 30
 */
import postgres from 'postgres'
import { databaseUrl } from './conciliacao-comum.mts'

const dias = Number(process.argv[2] ?? 30)
const sql = postgres(databaseUrl(), { max: 1 })

const porOrigem = await sql`
  select o.name org, coalesce(v.sugestao_origem, 'sem palpite') origem,
         count(*)::int decisoes,
         count(*) filter (where v.acao = 'confirmar')::int aceitas
  from validacoes v join orgs o on o.id = v.org_id
  where v.acao in ('confirmar','corrigir') and v.created_at >= now() - make_interval(days => ${dias})
  group by 1, 2 order by 1, 3 desc`

const porContraparte = await sql`
  select c.display_name contraparte, count(*)::int decisoes,
         count(*) filter (where v.acao = 'confirmar')::int aceitas
  from validacoes v join counterparties c on c.id = v.counterparty_id
  where v.acao in ('confirmar','corrigir') and v.sugestao_categoria_id is not null
    and v.created_at >= now() - make_interval(days => ${dias})
  group by 1 order by 2 desc limit 20`

const volume = await sql`
  select acao, count(*)::int n from validacoes
  where created_at >= now() - make_interval(days => ${dias}) group by 1 order by 2 desc`
await sql.end()

const pct = (a: number, n: number) => (n === 0 ? '—' : `${Math.round((100 * a) / n)}%`)
console.log(`\nÚltimos ${dias} dias\n\nVolume por ação`)
for (const v of volume) console.log(`  ${v.acao.padEnd(10)} ${v.n}`)
console.log('\nAcerto por origem do palpite')
for (const r of porOrigem) console.log(`  ${r.org} · ${r.origem.padEnd(12)} ${pct(r.aceitas, r.decisoes)} (${r.aceitas}/${r.decisoes})`)
console.log('\nContrapartes com mais decisões')
for (const r of porContraparte) console.log(`  ${String(r.contraparte).slice(0, 40).padEnd(40)} ${pct(r.aceitas, r.decisoes)} (${r.aceitas}/${r.decisoes})`)
```

Conferir o nome da coluna de nome em `counterparties` (`display_name` ou outro) em `packages/db/src/schema/counterparty.ts` e ajustar.

- [ ] **Step 2: Verificação completa**

Run, de `apps/web`: `npx tsc --noEmit -p . && npx vitest run && npm run build`
Run, de `packages/db`: `npx vitest run`
Expected: tudo verde.

- [ ] **Step 3: Commit**

```bash
git add scripts/acerto-da-sugestao.mts
git commit -m "chore(validacoes): script de acerto do palpite"
```

- [ ] **Step 4: Ordem do deploy (para o dono)**

1. Abrir `supabase/migrations/00074_validacoes.sql` no editor e rodar no SQL Editor do projeto `vntvwvhpquyayuiypacf` (memória: copiar do arquivo, não do terminal).
2. Conferir: `select acao, count(*) from validacoes group by 1;` mostra só `legado`.
3. Merge em master e push.
4. Classificar um lançamento no card e conferir que nasceu um `confirmar` ou `corrigir`.
5. Em 2 a 3 semanas: `npx tsx --tsconfig apps/web/tsconfig.json scripts/acerto-da-sugestao.mts 21`.
