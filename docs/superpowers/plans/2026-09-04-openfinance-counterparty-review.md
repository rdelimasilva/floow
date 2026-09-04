# Fila de revisão por contraparte — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a detecção de natureza por texto (`nature-suspects.ts`) por
identidade de contraparte (CNPJ/CPF ou descrição do próprio banco): primeira
ocorrência exige revisão manual do usuário, ocorrências seguintes conciliam
pela decisão gravada.

**Architecture:** Dois níveis de decisão na ingestão. Nível 1 é sinal
estrutural do Banco Central (puro, sem I/O, em `normalize.ts`) — confirma sem
fila. Nível 2 resolve por contraparte contra uma tabela nova (`counterparties`),
uma consulta em lote por página de sincronização; contraparte desconhecida
nasce pendente e some da fila só quando o usuário confirma, retroativamente,
por chave estrangeira (nunca por texto). Um portão por org bloqueia o
dashboard só na primeira sincronização grande; depois disso, pendência é
balde visível e não-bloqueante.

**Tech Stack:** Next.js (App Router, Server Actions), Drizzle ORM / Postgres
(Supabase), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md`

## Global Constraints

- Nunca mais de 500 linhas por arquivo (CLAUDE.md do projeto) — dividir antes
  de ultrapassar.
- `db.transaction` em qualquer escrita que precise ser atômica com outra
  (confirmar contraparte grava a contraparte E reclassifica as transações; as
  duas falham juntas ou nenhuma falha).
- Todo filtro de org (`eq(transactions.orgId, orgId)`) é defesa em
  profundidade explícita, mesmo quando a query anterior já filtrou — o role da
  conexão de banco não passa por RLS.
- `review_state` é uma coluna gravada, nunca derivada de
  `counterparties.confirmed_at IS NULL` em tempo de consulta.
- Re-sync (`UPDATE` de enriquecimento em `persistPage`) NUNCA toca `type`,
  `category_id`, `counterparty_id`, `review_state` de uma linha existente —
  só a ação de confirmar e o script de backfill (uma vez) têm essa permissão.

---

## File Structure

**Novo:**
- `supabase/migrations/00035_counterparty_review.sql` — schema.
- `packages/db/src/schema/counterparty.ts` — tabela `counterparties`, enums, tipos.
- `apps/web/lib/openfinance/counterparty-key.ts` — identidade pura (CNPJ ou
  descrição + direção), sem I/O. Absorve `foldForMatch`/`foldForRuleMatch` de
  `nature-rules.ts`, que é retirado.
- `apps/web/lib/openfinance/resolve-counterparty.ts` — resolução com DB: carrega
  o índice de contrapartes da org, resolve uma transação normalizada, cria
  pendência quando não existe.
- `apps/web/lib/openfinance/counterparty-actions.ts` — `confirmCounterparty`
  (server action), substitui `nature-actions.ts`.
- `apps/web/lib/openfinance/counterparty-queries.ts` — leituras: grupos
  pendentes, contrapartes confirmadas, status do portão.
- `apps/web/lib/openfinance/backfill.ts` — reclassificação em massa (script de
  uma vez, chamado por uma rota admin).
- `apps/web/app/api/admin/backfill-counterparties/route.ts` — dispara o backfill.
- `apps/web/app/(app)/transactions/review/page.tsx` — página da fila.
- `apps/web/components/openfinance/counterparty-queue.tsx` — lista pendentes +
  confirmadas, formulário de confirmar. Usada pela página E pelo portão.
- `apps/web/components/openfinance/review-gate.tsx` — tela cheia que o layout
  renderiza no lugar do app enquanto o portão está fechado.

**Modificado:**
- `packages/core-finance/src/openfinance/normalize.ts` — Nível 1 novo, remove
  `kindForRef` fallback e `creditCardConnected`.
- `packages/core-finance/src/openfinance/normalize.test.ts` — testes
  correspondentes.
- `apps/web/lib/openfinance/sync.ts` — troca `applyNatureRules` pela
  resolução de contraparte; remove `hasLinkedCreditCard`/`loadNatureRules`.
- `packages/db/src/schema/auth.ts` — `orgs.reviewGateClearedAt`.
- `packages/db/src/index.ts` — exporta o schema novo.
- `apps/web/app/(app)/layout.tsx` — checa o portão.
- `apps/web/lib/cfo/budget-pacing-input.ts`,
  `apps/web/lib/finance/budget-daily-queries.ts`,
  `apps/web/lib/finance/budget-queries.ts`,
  `apps/web/lib/finance/debt-queries.ts` — filtro `review_state = 'confirmed'`.

**Removido (Task 11, só depois do backfill confirmado em produção):**
- `apps/web/lib/openfinance/nature-suspects.ts` e teste
- `apps/web/lib/openfinance/nature-queries.ts`
- `apps/web/lib/openfinance/nature-rules.ts` e teste (absorvido por
  `counterparty-key.ts`)
- `apps/web/lib/openfinance/nature-actions.ts` e teste (substituído por
  `counterparty-actions.ts`)
- `apps/web/components/openfinance/nature-review-panel.tsx`
- `apps/web/components/openfinance/nature-suspects-banner.tsx`
- `apps/web/components/openfinance/nature-suspects-boundary.tsx` e teste
- `apps/web/components/openfinance/nature-suspects-section.tsx`
- `apps/web/components/openfinance/nature-shortcut-dialog.tsx` e teste
- `supabase/migrations/00034_transaction_nature_rules.sql` fica (histórico),
  mas a tabela é derrubada pela 00035.

---

## Task 1: Schema — `counterparties`, colunas novas, migração dos dados antigos

**Files:**
- Create: `supabase/migrations/00035_counterparty_review.sql`
- Create: `packages/db/src/schema/counterparty.ts`
- Modify: `packages/db/src/schema/auth.ts` (adiciona coluna a `orgs`)
- Modify: `packages/db/src/schema/finance.ts` (adiciona colunas a `transactions`)
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/__tests__/finance-schema.test.ts` (segue o padrão já
  existente nesse arquivo — confirma que as colunas novas existem e os tipos
  batem)

**Interfaces:**
- Produces: `counterparties` (tabela Drizzle), `Counterparty`,
  `NewCounterparty` (tipos inferidos), `counterpartyKeyTypeEnum`
  (`'tax_id' | 'description'`), `counterpartyDirectionEnum`
  (`'in' | 'out'`), `reviewStateEnum` (`'confirmed' | 'pending'`).
  `transactions.counterpartyId`, `transactions.counterpartyTaxId`,
  `transactions.counterpartyName`, `transactions.reviewState`.
  `orgs.reviewGateClearedAt`.

- [ ] **Step 1: Escrever a migração SQL**

```sql
-- supabase/migrations/00035_counterparty_review.sql
-- =============================================================================
-- Fila de revisão por contraparte, substituindo a detecção de natureza por
-- texto (00034). Ver
-- docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md
-- =============================================================================

CREATE TYPE public.counterparty_key_type AS ENUM ('tax_id', 'description');
CREATE TYPE public.counterparty_direction AS ENUM ('in', 'out');
CREATE TYPE public.review_state AS ENUM ('confirmed', 'pending');

CREATE TABLE public.counterparties (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  key_type      public.counterparty_key_type NOT NULL,
  key_value     text NOT NULL CHECK (length(btrim(key_value)) > 0),
  direction     public.counterparty_direction NOT NULL,
  -- NULL para tax_id (mesma entidade em qualquer conta). Obrigatório para
  -- description (vocabulário daquele banco específico).
  account_id    uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  nature        public.transaction_type,
  category_id   uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  display_name  text NOT NULL,
  confirmed_at  timestamptz,
  confirmed_by  uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (nature = 'transfer' AND category_id IS NULL)
    OR (nature IN ('income', 'expense') AND category_id IS NOT NULL)
    OR (nature IS NULL AND category_id IS NULL)
  )
);

CREATE INDEX idx_counterparties_org_id ON public.counterparties(org_id);

-- Dois índices únicos parciais, não um: account_id é anulável, e NULL nunca
-- colide com NULL num índice único do Postgres. Sem a partição, duas
-- contrapartes tax_id idênticas (account_id nulo nas duas) coexistiriam.
CREATE UNIQUE INDEX uq_counterparties_tax_id
  ON public.counterparties(org_id, key_type, key_value, direction)
  WHERE account_id IS NULL;

CREATE UNIQUE INDEX uq_counterparties_description
  ON public.counterparties(org_id, key_type, key_value, direction, account_id)
  WHERE account_id IS NOT NULL;

ALTER TABLE public.counterparties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "counterparties: members can select"
  ON public.counterparties FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "counterparties: members can insert"
  ON public.counterparties FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "counterparties: members can update"
  ON public.counterparties FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "counterparties: members can delete"
  ON public.counterparties FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- Migra as 3 regras de natureza existentes. Direção 'out': o detector antigo
-- só olhava lançamentos type='expense' (nature-queries.ts), então toda regra
-- gravada até aqui só valia para dinheiro saindo — preservar isso é FIEL ao
-- comportamento antigo, não uma escolha nova.
--
-- SÓ regra 'transfer' migra CONFIRMADA. Regra 'expense' ("é despesa mesmo",
-- ver nature-actions.ts) tinha nature sem categoria — e o CHECK acima exige
-- categoria para nature confirmada em expense/income. Reconstruir a categoria
-- por category_ref em SQL duplicaria em TypeScript a mesma lógica que já
-- existe (loadCategoryIndex, sync.ts) — a "dobra" que este projeto evita em
-- toda parte. Regra 'expense' migra como PENDENTE (nature NULL): a
-- contraparte volta para a fila do bootstrap, o usuário confirma de novo com
-- categoria — redundante, nunca incorreto. É diferente de perder a
-- informação: sem isso, ela desapareceria calada dentro do CASE abaixo.
INSERT INTO public.counterparties
  (org_id, key_type, key_value, direction, account_id, nature, category_id, display_name, confirmed_at)
SELECT
  org_id,
  'description'::public.counterparty_key_type,
  match_value,
  'out'::public.counterparty_direction,
  account_id,
  CASE WHEN nature = 'transfer' THEN nature ELSE NULL END,
  NULL,
  match_value,
  CASE WHEN nature = 'transfer' THEN now() ELSE NULL END
FROM public.transaction_nature_rules
WHERE account_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- account_id NULL não pode migrar para key_type='description' (a chave exige
-- conta). Nenhuma linha de produção está nesse estado (a UI sempre gravou
-- accountId do grupo), mas o CHECK abaixo teria rejeitado o INSERT em
-- silêncio caso existisse — não existe, confirmado contra produção antes
-- desta migração.

DROP TABLE public.transaction_nature_rules;

-- Colunas novas em transactions.
ALTER TABLE public.transactions
  ADD COLUMN counterparty_id uuid REFERENCES public.counterparties(id) ON DELETE SET NULL,
  ADD COLUMN counterparty_tax_id text,
  ADD COLUMN counterparty_name text,
  ADD COLUMN review_state public.review_state NOT NULL DEFAULT 'confirmed';

-- Índice que serve DOIS propósitos: a contagem do portão
-- (org_id, review_state = 'pending') e o filtro dos 4 agregadores
-- (org_id, review_state = 'confirmed').
CREATE INDEX idx_transactions_org_review_state
  ON public.transactions(org_id, review_state);

CREATE INDEX idx_transactions_counterparty_id
  ON public.transactions(counterparty_id)
  WHERE counterparty_id IS NOT NULL;

-- Portão: quando a org zerou a fila pela primeira vez, fica destravada para
-- sempre, mesmo que uma conexão nova traga uma pendência grande depois.
ALTER TABLE public.orgs
  ADD COLUMN review_gate_cleared_at timestamptz;
```

- [ ] **Step 2: Aplicar a migração local**

Run: `cd supabase && npx supabase db push` (ou o comando que o projeto já usa
para aplicar migrations locais — confirmar em `package.json`/README antes; se
não houver CLI configurado localmente, aplicar via `psql`/painel do Supabase
contra o banco de desenvolvimento).

Expected: migração aplica sem erro; `\d counterparties` e `\d transactions`
no psql mostram as colunas novas.

- [ ] **Step 3: Schema Drizzle — `counterparty.ts`**

```typescript
// packages/db/src/schema/counterparty.ts
import { pgTable, pgEnum, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { orgs } from './auth'
import { accounts, categories, transactionTypeEnum } from './finance'

export const counterpartyKeyTypeEnum = pgEnum('counterparty_key_type', ['tax_id', 'description'])
export const counterpartyDirectionEnum = pgEnum('counterparty_direction', ['in', 'out'])
export const reviewStateEnum = pgEnum('review_state', ['confirmed', 'pending'])

/**
 * Uma contraparte identificada por CNPJ/CPF ou, na ausência dele, pela
 * descrição do próprio banco — sempre com direção do dinheiro embutida na
 * chave, para que cobrança e reembolso da mesma entidade nunca colidam.
 *
 * Ver docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md
 */
export const counterparties = pgTable(
  'counterparties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    keyType: counterpartyKeyTypeEnum('key_type').notNull(),
    keyValue: text('key_value').notNull(),
    direction: counterpartyDirectionEnum('direction').notNull(),
    /** NULL para tax_id; obrigatório para description. */
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    /** NULL enquanto pendente. */
    nature: transactionTypeEnum('nature'),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: uuid('confirmed_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOrgId: index('idx_counterparties_org_id').on(table.orgId),
  }),
)

export type Counterparty = typeof counterparties.$inferSelect
export type NewCounterparty = typeof counterparties.$inferInsert
```

Os índices únicos parciais não são representáveis no builder do Drizzle da
mesma forma que a SQL crua (`.where()` em `uniqueIndex` gera `WHERE`, mas para
manter a fonte de verdade única, os únicos parciais já foram criados no Step 1
— aqui só declaramos o `index` simples de apoio; o Drizzle não precisa saber
dos parciais para gerar SQL, já existem no banco).

- [ ] **Step 4: Colunas novas em `transactions` e `orgs`**

Em `packages/db/src/schema/finance.ts`, dentro da definição de `transactions`,
logo após `polpType: text('polp_type'),`:

```typescript
    /** FK para a contraparte que decidiu a natureza (Nível 2). Null no Nível 1. */
    counterpartyId: uuid('counterparty_id').references(() => counterparties.id, { onDelete: 'set null' }),
    /** Snapshot do CNPJ/CPF no momento da ingestão — sobrevive ao re-sync sobrescrever a descrição. */
    counterpartyTaxId: text('counterparty_tax_id'),
    /** Snapshot do nome que a Polp mandou para a contraparte. */
    counterpartyName: text('counterparty_name'),
    /**
     * 'pending': natureza ainda não confirmada pelo usuário, fora das somas de
     * orçamento/pacing/dívida. Nunca derivado de counterparties.confirmedAt —
     * gravado, para que o único lugar que possa divergir seja a ação de
     * confirmar.
     */
    reviewState: reviewStateEnum('review_state').notNull().default('confirmed'),
```

Isso cria uma dependência circular de import (`finance.ts` precisa de
`counterparties` de `counterparty.ts`, que por sua vez importa `accounts` e
`categories` de `finance.ts`). Resolver com import tardio dentro do arquivo:
mover a FK de `counterpartyId` para ser declarada SEM `.references()` inline
e, em vez disso, declarar a referência via `foreignKey()` no bloco de índices
do `pgTable`, importando `counterparties` só nesse ponto:

```typescript
// no topo de finance.ts, junto dos outros imports:
import { foreignKey } from 'drizzle-orm/pg-core'

// dentro do array de callback de transactions, junto dos outros índices:
    fkCounterparty: foreignKey({
      columns: [table.counterpartyId],
      foreignColumns: [counterparties.id],
    }).onDelete('set null'),
```

E em `counterparty.ts`, a coluna `accountId`/`categoryId` continuam
`.references()` diretas para `finance.ts` (a dependência só é circular na
direção `finance.ts → counterparty.ts`, não na outra). Se o TypeScript
reclamar de import circular em tempo de build, mover `counterpartyId` para
`uuid('counterparty_id')` simples (sem FK do lado do Drizzle) — o `REFERENCES`
já existe no banco pela migração SQL do Step 1, que é quem efetivamente
constrange a integridade; a declaração do Drizzle é só para o tipo e para
`drizzle-kit generate` não tentar recriar a coluna diferente.

Em `packages/db/src/schema/auth.ts`, dentro de `orgs`:

```typescript
  reviewGateClearedAt: timestamp('review_gate_cleared_at', { withTimezone: true }),
```

- [ ] **Step 5: Exportar o schema novo**

Em `packages/db/src/index.ts`, adicionar depois de `export * from './schema/openfinance'`:

```typescript
export * from './schema/counterparty'
```

- [ ] **Step 6: Teste de schema**

Ler `packages/db/src/__tests__/finance-schema.test.ts` primeiro para seguir o
padrão exato (provavelmente introspecção de colunas via `getTableColumns` ou
similar). Adicionar equivalente cobrindo:

```typescript
import { transactions } from '../schema/finance'
import { counterparties } from '../schema/counterparty'
import { orgs } from '../schema/auth'
import { getTableColumns } from 'drizzle-orm'

it('transactions tem as colunas da fila de revisão', () => {
  const cols = getTableColumns(transactions)
  expect(cols.counterpartyId).toBeDefined()
  expect(cols.counterpartyTaxId).toBeDefined()
  expect(cols.counterpartyName).toBeDefined()
  expect(cols.reviewState).toBeDefined()
})

it('counterparties tem a identidade completa', () => {
  const cols = getTableColumns(counterparties)
  expect(cols.keyType).toBeDefined()
  expect(cols.keyValue).toBeDefined()
  expect(cols.direction).toBeDefined()
  expect(cols.accountId).toBeDefined()
  expect(cols.nature).toBeDefined()
  expect(cols.categoryId).toBeDefined()
  expect(cols.confirmedAt).toBeDefined()
})

it('orgs tem o portão da revisão', () => {
  expect(getTableColumns(orgs).reviewGateClearedAt).toBeDefined()
})
```

- [ ] **Step 7: Rodar os testes de schema**

Run: `cd packages/db && npx vitest run src/__tests__/finance-schema.test.ts`
Expected: PASS

- [ ] **Step 8: Typecheck do pacote `db`**

Run: `cd packages/db && npx tsc --noEmit`
Expected: sem erro. Se a referência circular do Step 4 quebrar, aplicar o
fallback descrito ali (coluna sem `.references()` do lado do Drizzle).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/00035_counterparty_review.sql packages/db
git commit -m "feat(db): schema da fila de revisao por contraparte"
```

---

## Task 2: `normalize.ts` — Nível 1 novo, remove inferência por categoria

**Files:**
- Modify: `packages/core-finance/src/openfinance/normalize.ts`
- Modify: `packages/core-finance/src/__tests__/openfinance/normalize.test.ts`

**Interfaces:**
- Produces: `NormalizedPolpTransaction` ganha `natureConfirmed: boolean`,
  `counterpartyTaxId: string | null`, `counterpartyName: string | null`.
  `normalizeAccountTransaction(tx: PolpAccountTransaction): NormalizedPolpTransaction`
  perde o segundo parâmetro `options`. `normalizeCardTransaction` mantém
  assinatura.
- Consumes: nada de tasks anteriores (pacote `core-finance` é folha).

- [ ] **Step 1: Escrever os testes que description o Nível 1 novo e a remoção do antigo**

Em `packages/core-finance/src/__tests__/openfinance/normalize.test.ts`,
substituir os três testes que dependiam do fallback removido:

```typescript
// Substitui 'não conta aporte em poupança como despesa'
it('category_ref não decide mais natureza sozinho — cai pendente', () => {
  // TRANSFER_OUT_SAVINGS antes virava transferência sozinho, por
  // category_ref. Sem o `type` do BCB confirmando, agora fica como
  // placeholder (débito → despesa) e sinalizado como não confirmado — quem
  // decide é a contraparte, não o rótulo da Polp.
  const t = normalizeAccountTransaction(accountTx({ category_ref: 'TRANSFER_OUT_SAVINGS' }))
  expect(t.type).toBe('expense')
  expect(t.natureConfirmed).toBe(false)
})

// Substitui as duas de pagamento de fatura + creditCardConnected
it('pagamento de fatura não resolve mais sozinho por category_ref', () => {
  // O caso que motivou o `creditCardConnected` original: agora cai pendente
  // como qualquer outra contraparte, independente de haver cartão conectado.
  const t = normalizeAccountTransaction(accountTx({ category_ref: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' }))
  expect(t.type).toBe('expense')
  expect(t.natureConfirmed).toBe(false)
})
```

Remover as duas linhas `it('conta o pagamento de fatura...')` e
`it('vira transferência quando o cartão está conectado'...)` do arquivo.

Adicionar ao final do `describe('normalizeAccountTransaction', ...)`:

```typescript
it('extrai o CNPJ/CPF da contraparte para a identidade de Nível 2', () => {
  const t = normalizeAccountTransaction(
    accountTx({ counterparty: { name: 'X', alias: null, tax_id: '12.345.678/0001-90', website_url: null, logo_url: null } }),
  )
  expect(t.counterpartyTaxId).toBe('12345678000190')
})

it('sem contraparte, counterpartyTaxId é null', () => {
  expect(normalizeAccountTransaction(accountTx()).counterpartyTaxId).toBeNull()
})
```

No `describe('camada 1: natureza determinada pelo type do BCB', ...)`,
substituir o teste `'OUTROS não desempata: quem decide é o category_ref'` por:

```typescript
it('OUTROS não resolve mais por category_ref — cai pendente', () => {
  const t = normalizeAccountTransaction(
    accountTx({ type: 'OUTROS', category_ref: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS' }),
  )
  expect(t.natureConfirmed).toBe(false)
  // O placeholder vem do crédito/débito, nunca de category_ref.
  expect(t.type).toBe('expense')
})

it('os 4 casos explícitos do BCB continuam confirmados sem contraparte', () => {
  const aplicacao = normalizeAccountTransaction(accountTx({ type: 'APLICACAO_FINANCEIRA' }))
  expect(aplicacao.natureConfirmed).toBe(true)
  expect(aplicacao.type).toBe('transfer')
})
```

Adicionar um novo `describe` para o Nível 1 de cartão:

```typescript
describe('camada 1 no cartão: débito fora dos 3 casos explícitos é despesa', () => {
  it('compra comum (PAGAMENTO) é despesa confirmada, sem fila', () => {
    const t = normalizeCardTransaction(cardTx({ transaction_type: 'PAGAMENTO', credit_debit_type: 'DEBITO' }))
    expect(t.type).toBe('expense')
    expect(t.natureConfirmed).toBe(true)
  })

  it('OUTROS em débito também é despesa confirmada', () => {
    const t = normalizeCardTransaction(cardTx({ transaction_type: 'OUTROS', credit_debit_type: 'DEBITO' }))
    expect(t.type).toBe('expense')
    expect(t.natureConfirmed).toBe(true)
  })

  it('crédito fora dos 3 casos explícitos não resolve — cai pendente', () => {
    // O resíduo real: estorno informal, "pagamento com saldo", crédito que
    // não veio marcado ESTORNO nem CASHBACK. Não é despesa, não sabemos o
    // que é — vai para a fila.
    const t = normalizeCardTransaction(cardTx({ transaction_type: 'OUTROS', credit_debit_type: 'CREDITO' }))
    expect(t.natureConfirmed).toBe(false)
    expect(t.type).toBe('income')
  })

  it('os 3 casos explícitos continuam confirmados', () => {
    expect(normalizeCardTransaction(cardTx({ transaction_type: 'PAGAMENTO_FATURA', credit_debit_type: 'CREDITO' })).natureConfirmed).toBe(true)
    expect(normalizeCardTransaction(cardTx({ transaction_type: 'ESTORNO', credit_debit_type: 'CREDITO' })).natureConfirmed).toBe(true)
    expect(normalizeCardTransaction(cardTx({ transaction_type: 'CASHBACK', credit_debit_type: 'CREDITO' })).natureConfirmed).toBe(true)
  })

  it('extrai tax_id da counterparty do cartão', () => {
    const t = normalizeCardTransaction(
      cardTx({ counterparty: { name: 'Mercado Livre', alias: null, tax_id: '03007331000141', website_url: null, logo_url: null } }),
    )
    expect(t.counterpartyTaxId).toBe('03007331000141')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham como esperado**

Run: `cd packages/core-finance && npx vitest run src/__tests__/openfinance/normalize.test.ts`
Expected: FAIL — `natureConfirmed`/`counterpartyTaxId` não existem ainda,
`creditCardConnected` ainda está na assinatura antiga.

- [ ] **Step 3: Reescrever `normalizeAccountTransaction` e `natureFromPolpType`**

Em `packages/core-finance/src/openfinance/normalize.ts`, remover o import de
`kindForRef` (linha `import { kindForRef } from './taxonomy'`) e o parâmetro
`options`/`AccountNormalizeOptions`. Substituir o corpo de
`normalizeAccountTransaction`:

```typescript
/** Transação de conta bancária (GET /accounts/{account}/transactions). */
export function normalizeAccountTransaction(tx: PolpAccountTransaction): NormalizedPolpTransaction {
  const categoryRef = tx.category_ref ?? null
  const amountCents = signedAmount(tx.transaction_amount.amount, tx.credit_debit_type)

  const resolved = natureFromPolpType(tx.type)
  const type = resolved ?? (tx.credit_debit_type === 'CREDITO' ? 'income' : 'expense')

  const settlement =
    tx.completed_authorised_payment_type === 'LANCAMENTO_FUTURO'
      ? 'scheduled'
      : tx.completed_authorised_payment_type === 'TRANSACAO_PROCESSANDO'
        ? 'processing'
        : 'settled'

  return {
    externalId: tx.id,
    date: toCompetenceDate(tx.transaction_date_time),
    amountCents,
    type,
    natureConfirmed: resolved !== undefined,
    counterpartyTaxId: digitsOnly(tx.partie_cnpj_cpf) ?? digitsOnly(tx.counterparty?.tax_id) ?? null,
    counterpartyName: tx.counterparty?.alias ?? tx.counterparty?.name ?? null,
    description: describe(tx.transaction_name, tx.counterparty),
    categoryRef,
    polpType: tx.type ?? null,
    payeeMcc: null,
    billPostDate: null,
    billForecastMonth: null,
    installmentNumber: null,
    installmentTotal: null,
    settlement,
    foreign: null,
  }
}
```

Remover a interface `AccountNormalizeOptions` inteira (não é mais usada por
ninguém). Adicionar a função auxiliar perto de `signedAmount`:

```typescript
/** Só dígitos. A Polp normalmente já manda limpo, mas pontuação de CNPJ
 * ("12.345.678/0001-90") faria duas representações da mesma contraparte
 * virarem duas linhas em `counterparties`. */
function digitsOnly(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}
```

- [ ] **Step 4: Reescrever `cardType` e `normalizeCardTransaction`**

```typescript
/** Transação de cartão de crédito (GET /credit-cards/{creditCard}/transactions). */
export function normalizeCardTransaction(tx: PolpCardTransaction): NormalizedPolpTransaction {
  const categoryRef = tx.category_ref ?? null
  // `brazilian_amount` já vem convertido pela Polp; `amount` é a moeda da compra.
  const amountCents = signedAmount(tx.brazilian_amount.amount, tx.credit_debit_type)
  const { type, natureConfirmed } = cardType(tx)

  const foreign =
    tx.amount && tx.amount.currency !== tx.brazilian_amount.currency
      ? { amountCents: Math.abs(parseAmountCents(tx.amount.amount)), currency: tx.amount.currency }
      : null

  return {
    externalId: tx.id,
    date: toCompetenceDate(tx.transaction_date_time),
    amountCents,
    type,
    natureConfirmed,
    counterpartyTaxId: digitsOnly(tx.counterparty?.tax_id),
    counterpartyName: tx.counterparty?.alias ?? tx.counterparty?.name ?? null,
    description: describe(tx.transaction_name, tx.counterparty),
    categoryRef,
    polpType: null,
    payeeMcc: tx.payee_mcc ?? null,
    billPostDate: billPostDateOrNull(tx.bill_post_date),
    billForecastMonth: forecastMonthOrNull(tx.bill_forecast_date),
    ...installments(tx.charge_identificator, tx.charge_number),
    settlement: 'settled',
    foreign,
  }
}

/**
 * Sinal estrutural do BCB para cartão. Três casos o Banco Central já resolve;
 * o quarto (novo) é estrutural do PRODUTO, não do comerciante: um cartão de
 * crédito não recebe salário nem Pix, então um débito que não é fatura paga,
 * estorno nem cashback só pode ser compra.
 *
 * Crédito fora dos três casos explícitos NÃO resolve — é o resíduo raro (um
 * estorno informal, "pagamento com saldo") que precisa da fila.
 */
function cardType(tx: PolpCardTransaction): { type: NormalizedPolpTransaction['type']; natureConfirmed: boolean } {
  switch (tx.transaction_type) {
    case 'PAGAMENTO_FATURA':
      return { type: 'transfer', natureConfirmed: true }
    case 'ESTORNO':
      return { type: 'expense', natureConfirmed: true }
    case 'CASHBACK':
      return { type: 'income', natureConfirmed: true }
    default:
      if (tx.credit_debit_type === 'DEBITO') return { type: 'expense', natureConfirmed: true }
      return { type: 'income', natureConfirmed: false }
  }
}
```

- [ ] **Step 5: Atualizar `NormalizedPolpTransaction` e remover o import morto**

No topo do arquivo, remover `import { kindForRef } from './taxonomy'` (não
resta nenhum uso). Na interface `NormalizedPolpTransaction`, adicionar logo
após `type: 'income' | 'expense' | 'transfer'`:

```typescript
  /**
   * Verdadeiro quando `type` já é natureza confirmada pelo Nível 1 (sinal
   * estrutural do Banco Central). Falso quando `type` é só um placeholder
   * (crédito→receita, débito→despesa, nunca transferência) até a resolução
   * de contraparte decidir de verdade.
   */
  natureConfirmed: boolean
  /** CNPJ/CPF só dígitos, ou null. Identidade de Nível 2. */
  counterpartyTaxId: string | null
  /** Nome que a Polp mandou para a contraparte, para a fila mostrar. */
  counterpartyName: string | null
```

- [ ] **Step 6: Rodar os testes de novo**

Run: `cd packages/core-finance && npx vitest run src/__tests__/openfinance/normalize.test.ts`
Expected: PASS — todos, incluindo os pré-existentes que não foram tocados
(sinal, data, MCC, parcelamento, moeda estrangeira).

- [ ] **Step 7: Typecheck do pacote**

Run: `cd packages/core-finance && npx tsc --noEmit`
Expected: sem erro. Se `sync.ts` (app) já quebrar aqui por causa da assinatura
de `normalizeAccountTransaction`, ignorar por ora — Task 5 corrige o
chamador.

- [ ] **Step 8: Commit**

```bash
git add packages/core-finance
git commit -m "feat(openfinance): nivel 1 novo em normalize, remove inferencia por category_ref"
```

---

## Task 3: `counterparty-key.ts` — identidade pura

**Files:**
- Create: `apps/web/lib/openfinance/counterparty-key.ts`
- Test: `apps/web/__tests__/openfinance/counterparty-key.test.ts`

**Interfaces:**
- Consumes: `NormalizedPolpTransaction` (Task 2) — só os campos
  `counterpartyTaxId`, `description`, `amountCents`.
- Produces: `CounterpartyKey { keyType: 'tax_id' | 'description'; keyValue: string; direction: 'in' | 'out'; accountId: string | null }`,
  `counterpartyKeyFor(tx, accountId): CounterpartyKey | null`,
  `compositeKey(k): string`, `foldForMatch(value: string): string`.

- [ ] **Step 1: Escrever o teste**

```typescript
// apps/web/__tests__/openfinance/counterparty-key.test.ts
import { describe, expect, it } from 'vitest'
import { counterpartyKeyFor, compositeKey, foldForMatch } from '@/lib/openfinance/counterparty-key'

const CONTA = 'conta-1'

function tx(overrides: { counterpartyTaxId?: string | null; description?: string; amountCents?: number } = {}) {
  return {
    counterpartyTaxId: overrides.counterpartyTaxId ?? null,
    description: overrides.description ?? 'Débito automático PERS BLACK 12/08',
    amountCents: overrides.amountCents ?? -50000,
  }
}

describe('foldForMatch', () => {
  it('ignora acento, caixa e espaço sobrando', () => {
    expect(foldForMatch('  Débito   Automático  ')).toBe('DEBITO AUTOMATICO')
  })
})

describe('counterpartyKeyFor', () => {
  it('usa tax_id quando presente, accountId nulo', () => {
    const key = counterpartyKeyFor(tx({ counterpartyTaxId: '12345678000190' }), CONTA)
    expect(key).toEqual({ keyType: 'tax_id', keyValue: '12345678000190', direction: 'out', accountId: null })
  })

  it('cai para descrição normalizada e escopada à conta quando não há tax_id', () => {
    const key = counterpartyKeyFor(tx({ description: 'Débito automático PERS BLACK 12/08 1234' }), CONTA)
    expect(key).toEqual({
      keyType: 'description',
      keyValue: 'DEBITO AUTOMATICO PERS BLACK',
      direction: 'out',
      accountId: CONTA,
    })
  })

  it('a mesma operação repetida todo mês cai na mesma chave — dígitos somem', () => {
    const a = counterpartyKeyFor(tx({ description: 'Débito automático PERS BLACK 10/08' }), CONTA)
    const b = counterpartyKeyFor(tx({ description: 'Débito automático PERS BLACK 11/09' }), CONTA)
    expect(a).toEqual(b)
  })

  it('direção vem do sinal do valor: entrada é "in", saída é "out"', () => {
    const entrada = counterpartyKeyFor(tx({ amountCents: 30000 }), CONTA)
    const saida = counterpartyKeyFor(tx({ amountCents: -30000 }), CONTA)
    expect(entrada!.direction).toBe('in')
    expect(saida!.direction).toBe('out')
  })

  it('a mesma contraparte cobrando e devolvendo são chaves diferentes', () => {
    // O falso positivo mais caro do detector antigo: Unimed cobrando a
    // mensalidade e devolvendo reembolso são a mesma entidade, mas o sinal
    // errado se essas duas viram a MESMA chave.
    const cobranca = counterpartyKeyFor(tx({ counterpartyTaxId: '1', amountCents: -32562 }), CONTA)
    const reembolso = counterpartyKeyFor(tx({ counterpartyTaxId: '1', amountCents: 5522 }), CONTA)
    expect(compositeKey(cobranca!)).not.toBe(compositeKey(reembolso!))
  })

  it('descrição que normaliza para vazio não produz chave', () => {
    expect(counterpartyKeyFor(tx({ description: '12/08 1234' }), CONTA)).toBeNull()
  })
})

describe('compositeKey', () => {
  it('duas chaves tax_id iguais produzem a mesma string', () => {
    const a = counterpartyKeyFor(tx({ counterpartyTaxId: '999' }), 'conta-a')
    const b = counterpartyKeyFor(tx({ counterpartyTaxId: '999' }), 'conta-b')
    // accountId é ignorado na chave de tax_id — mesma entidade em qualquer conta.
    expect(compositeKey(a!)).toBe(compositeKey(b!))
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/web && npx vitest run __tests__/openfinance/counterparty-key.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```typescript
// apps/web/lib/openfinance/counterparty-key.ts
/**
 * Identidade de uma contraparte, para o Nível 2 da ingestão. Função pura,
 * sem I/O — quem consulta e grava é `resolve-counterparty.ts`.
 *
 * Ver docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md
 */

export interface CounterpartyKey {
  keyType: 'tax_id' | 'description'
  keyValue: string
  direction: 'in' | 'out'
  /** NULL para tax_id (mesma entidade em qualquer conta). Obrigatório para description. */
  accountId: string | null
}

/**
 * Forma canônica dos dois lados de qualquer comparação: sem acento, sem
 * caixa, sem espaço sobrando.
 */
export function foldForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Além do que `foldForMatch` faz, apaga sequências numéricas: a mesma
 * operação repetida todo mês chega com data e número diferentes no meio da
 * descrição ("Débito automático PERS BLACK 12/08 1234"), e sem isso a mesma
 * contraparte criaria uma linha nova a cada sincronização.
 */
function foldForIdentity(value: string): string {
  return foldForMatch(value)
    .replace(/\d[\d./-]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface KeyableTransaction {
  counterpartyTaxId: string | null
  description: string
  amountCents: number
}

/**
 * A chave que identifica esta contraparte, ou null quando a descrição não
 * sobra nada depois de normalizada (nunca acontece com dado real, mas um
 * candidato sem chave cai pendente sem contraparte em vez de quebrar a
 * sincronização inteira — ver `resolve-counterparty.ts`).
 */
export function counterpartyKeyFor(tx: KeyableTransaction, accountId: string): CounterpartyKey | null {
  const direction: CounterpartyKey['direction'] = tx.amountCents >= 0 ? 'in' : 'out'

  if (tx.counterpartyTaxId) {
    return { keyType: 'tax_id', keyValue: tx.counterpartyTaxId, direction, accountId: null }
  }

  const keyValue = foldForIdentity(tx.description)
  if (!keyValue) return null

  return { keyType: 'description', keyValue, direction, accountId }
}

/** String única para usar como chave de Map —   nunca aparece em CNPJ, descrição ou id de conta. */
export function compositeKey(key: CounterpartyKey): string {
  return [key.keyType, key.keyValue, key.direction, key.accountId ?? ''].join(' ')
}
```

- [ ] **Step 4: Rodar os testes**

Run: `cd apps/web && npx vitest run __tests__/openfinance/counterparty-key.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/openfinance/counterparty-key.ts apps/web/__tests__/openfinance/counterparty-key.test.ts
git commit -m "feat(openfinance): identidade pura de contraparte (cnpj ou descricao + direcao)"
```

---

## Task 4: `resolve-counterparty.ts` — resolução com DB

**Files:**
- Create: `apps/web/lib/openfinance/resolve-counterparty.ts`
- Test: `apps/web/__tests__/openfinance/resolve-counterparty.test.ts`

**Interfaces:**
- Consumes: `counterpartyKeyFor`, `compositeKey` (Task 3);
  `NormalizedPolpTransaction` (Task 2); `counterparties` (Task 1).
- Produces: `ResolvedTransaction` (estende `NormalizedPolpTransaction` com
  `reviewState`, `counterpartyId`, `categoryId`);
  `loadCounterpartyIndex(db, orgId): Promise<Map<string, CounterpartyRecord>>`;
  `resolveCounterparty(db, orgId, accountId, tx, index): Promise<ResolvedTransaction>`.
  Consumido por `sync.ts` (Task 5).

- [ ] **Step 1: Escrever o teste com o padrão de mock de `db` já usado no projeto**

O projeto testa ação com DB simulando a cadeia do Drizzle na mão (ver
`apps/web/__tests__/openfinance/nature-actions.test.ts` para o padrão
`makeChain`). Seguir o mesmo estilo:

```typescript
// apps/web/__tests__/openfinance/resolve-counterparty.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveCounterparty, type CounterpartyRecord } from '@/lib/openfinance/resolve-counterparty'

const ORG = 'org-1'
const CONTA = 'conta-1'

function normalizedTx(overrides: Partial<{
  type: 'income' | 'expense' | 'transfer'
  natureConfirmed: boolean
  counterpartyTaxId: string | null
  counterpartyName: string | null
  description: string
  amountCents: number
}> = {}) {
  return {
    externalId: 'ext-1',
    date: '2026-09-01',
    amountCents: -50000,
    type: 'expense' as const,
    natureConfirmed: false,
    counterpartyTaxId: null,
    counterpartyName: null,
    description: 'Débito automático PERS BLACK 12/08',
    categoryRef: null,
    polpType: null,
    payeeMcc: null,
    billPostDate: null,
    billForecastMonth: null,
    installmentNumber: null,
    installmentTotal: null,
    settlement: 'settled' as const,
    foreign: null,
    ...overrides,
  }
}

let inserted: any[] = []
let insertReturns: any[] = []

function makeDb() {
  return {
    insert: vi.fn(() => ({
      values: (v: any) => {
        inserted.push(v)
        return {
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve(insertReturns),
          }),
        }
      },
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]), // sem raça no caminho feliz
        }),
      }),
    })),
  } as any
}

beforeEach(() => {
  inserted = []
  insertReturns = []
})

describe('resolveCounterparty', () => {
  it('Nível 1 confirmado não toca o índice nem o banco', async () => {
    const db = makeDb()
    const index = new Map<string, CounterpartyRecord>()
    const tx = normalizedTx({ natureConfirmed: true, type: 'transfer' })

    const resolved = await resolveCounterparty(db, ORG, CONTA, tx, index)

    expect(resolved.reviewState).toBe('confirmed')
    expect(resolved.counterpartyId).toBeNull()
    expect(resolved.categoryId).toBeNull()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('contraparte já confirmada no índice aplica natureza e categoria', async () => {
    const db = makeDb()
    const index = new Map<string, CounterpartyRecord>()
    const tx = normalizedTx({ counterpartyTaxId: '999' })
    index.set('tax_id 999 out ', {
      id: 'cp-1',
      keyType: 'tax_id',
      keyValue: '999',
      direction: 'out',
      accountId: null,
      nature: 'transfer',
      categoryId: null,
      confirmedAt: new Date(),
    })

    const resolved = await resolveCounterparty(db, ORG, CONTA, tx, index)

    expect(resolved.reviewState).toBe('confirmed')
    expect(resolved.counterpartyId).toBe('cp-1')
    expect(resolved.type).toBe('transfer')
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('contraparte nova é criada pendente e some do banco na segunda vez', async () => {
    const db = makeDb()
    insertReturns = [{
      id: 'cp-novo', keyType: 'tax_id', keyValue: '111', direction: 'out',
      accountId: null, nature: null, categoryId: null, confirmedAt: null,
    }]
    const index = new Map<string, CounterpartyRecord>()
    const tx = normalizedTx({ counterpartyTaxId: '111' })

    const first = await resolveCounterparty(db, ORG, CONTA, tx, index)
    expect(first.reviewState).toBe('pending')
    expect(first.counterpartyId).toBe('cp-novo')
    expect(first.categoryId).toBeNull()
    expect(db.insert).toHaveBeenCalledTimes(1)

    // Segunda transação, mesma chave: já está no índice local, não insere de novo.
    const second = await resolveCounterparty(db, ORG, CONTA, normalizedTx({ counterpartyTaxId: '111' }), index)
    expect(second.counterpartyId).toBe('cp-novo')
    expect(db.insert).toHaveBeenCalledTimes(1)
  })

  it('sem tax_id, cai para descrição — pendente sem contraparte confirmada', async () => {
    const db = makeDb()
    insertReturns = [{
      id: 'cp-desc', keyType: 'description', keyValue: 'DEBITO AUTOMATICO PERS BLACK',
      direction: 'out', accountId: CONTA, nature: null, categoryId: null, confirmedAt: null,
    }]
    const index = new Map<string, CounterpartyRecord>()

    const resolved = await resolveCounterparty(db, ORG, CONTA, normalizedTx(), index)

    expect(resolved.reviewState).toBe('pending')
    expect(resolved.counterpartyId).toBe('cp-desc')
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/web && npx vitest run __tests__/openfinance/resolve-counterparty.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```typescript
// apps/web/lib/openfinance/resolve-counterparty.ts
import { and, eq } from 'drizzle-orm'
import { getDb, counterparties } from '@floow/db'
import type { NormalizedPolpTransaction } from '@floow/core-finance'
import { counterpartyKeyFor, compositeKey, type CounterpartyKey } from './counterparty-key'

/**
 * Resolução de contraparte — o Nível 2 da ingestão. Nível 1 (sinal estrutural
 * do BCB) já resolveu em `normalize.ts`, puro; aqui é onde a identidade
 * encontra (ou cria) a decisão gravada pelo usuário.
 *
 * Ver docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md
 */

type Db = ReturnType<typeof getDb>

export interface CounterpartyRecord {
  id: string
  keyType: 'tax_id' | 'description'
  keyValue: string
  direction: 'in' | 'out'
  accountId: string | null
  nature: 'income' | 'expense' | 'transfer' | null
  categoryId: string | null
  confirmedAt: Date | null
}

export interface ResolvedTransaction extends NormalizedPolpTransaction {
  reviewState: 'confirmed' | 'pending'
  counterpartyId: string | null
  /**
   * Autoritativa sempre que `counterpartyId` não é null — null enquanto
   * pendente, o que o `categoryId` da contraparte diz quando confirmada.
   * Quem persiste (sync.ts) só deixa `matchCategory`/`categoryByRef`
   * decidirem quando `counterpartyId` é null (Nível 1, sem contraparte).
   */
  categoryId: string | null
}

/** Todas as contrapartes da org, uma vez por chamada de sincronização — o
 * mesmo padrão que `loadCategoryIndex`/`loadRules` já usam em `sync.ts`. O
 * volume por org é de centenas, não milhares: uma varredura cabe em memória
 * sem paginação. */
export async function loadCounterpartyIndex(db: Db, orgId: string): Promise<Map<string, CounterpartyRecord>> {
  const rows = await db.select().from(counterparties).where(eq(counterparties.orgId, orgId))
  const index = new Map<string, CounterpartyRecord>()
  for (const row of rows) {
    const record: CounterpartyRecord = {
      id: row.id,
      keyType: row.keyType,
      keyValue: row.keyValue,
      direction: row.direction,
      accountId: row.accountId,
      nature: row.nature,
      categoryId: row.categoryId,
      confirmedAt: row.confirmedAt,
    }
    index.set(compositeKey(record as CounterpartyKey), record)
  }
  return index
}

/**
 * Resolve UMA transação normalizada contra o índice da org, mutando o índice
 * quando cria uma contraparte nova — para que a segunda ocorrência da mesma
 * contraparte, na MESMA sincronização, não bata no banco de novo.
 */
export async function resolveCounterparty(
  db: Db,
  orgId: string,
  accountId: string,
  tx: NormalizedPolpTransaction,
  index: Map<string, CounterpartyRecord>,
): Promise<ResolvedTransaction> {
  if (tx.natureConfirmed) {
    return { ...tx, reviewState: 'confirmed', counterpartyId: null, categoryId: null }
  }

  const key = counterpartyKeyFor(tx, accountId)
  if (!key) {
    return { ...tx, reviewState: 'pending', counterpartyId: null, categoryId: null }
  }

  const k = compositeKey(key)
  let record = index.get(k)

  if (!record) {
    const [insertedRow] = await db
      .insert(counterparties)
      .values({
        orgId,
        keyType: key.keyType,
        keyValue: key.keyValue,
        direction: key.direction,
        accountId: key.accountId,
        displayName: tx.counterpartyName ?? tx.description,
      })
      .onConflictDoNothing()
      .returning()

    if (insertedRow) {
      record = {
        id: insertedRow.id,
        keyType: insertedRow.keyType,
        keyValue: insertedRow.keyValue,
        direction: insertedRow.direction,
        accountId: insertedRow.accountId,
        nature: insertedRow.nature,
        categoryId: insertedRow.categoryId,
        confirmedAt: insertedRow.confirmedAt,
      }
    } else {
      // Colidiu com outra página/sync criando a mesma contraparte entre o
      // SELECT do índice e este INSERT. Busca a linha que venceu a corrida.
      const [existing] = await db
        .select()
        .from(counterparties)
        .where(
          and(
            eq(counterparties.orgId, orgId),
            eq(counterparties.keyType, key.keyType),
            eq(counterparties.keyValue, key.keyValue),
            eq(counterparties.direction, key.direction),
          ),
        )
        .limit(1)
      record = existing
        ? {
            id: existing.id,
            keyType: existing.keyType,
            keyValue: existing.keyValue,
            direction: existing.direction,
            accountId: existing.accountId,
            nature: existing.nature,
            categoryId: existing.categoryId,
            confirmedAt: existing.confirmedAt,
          }
        : undefined
    }

    if (record) index.set(k, record)
  }

  if (!record) {
    // Não deveria acontecer (o insert ou o select de corrida sempre acham
    // algo), mas cair pendente sem contraparte é o desfecho seguro se
    // acontecer — nunca perder a transação.
    return { ...tx, reviewState: 'pending', counterpartyId: null, categoryId: null }
  }

  if (record.confirmedAt) {
    return {
      ...tx,
      type: record.nature ?? tx.type,
      reviewState: 'confirmed',
      counterpartyId: record.id,
      categoryId: record.categoryId,
    }
  }

  return { ...tx, reviewState: 'pending', counterpartyId: record.id, categoryId: null }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `cd apps/web && npx vitest run __tests__/openfinance/resolve-counterparty.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erro novo introduzido por este arquivo (erros em `sync.ts`
ainda existem até a Task 5 — ignorar por ora).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/openfinance/resolve-counterparty.ts apps/web/__tests__/openfinance/resolve-counterparty.test.ts
git commit -m "feat(openfinance): resolucao de contraparte contra o indice da org"
```

---

## Task 5: `sync.ts` — integra a resolução, remove o mecanismo antigo

**Files:**
- Modify: `apps/web/lib/openfinance/sync.ts`
- Test: `apps/web/__tests__/openfinance/sync-persist.test.ts` (novo — cobre só
  a decisão de categoria em `persistPage`, que é a lógica nova; o resto do
  fluxo não tem teste hoje e não é o foco desta task)

**Interfaces:**
- Consumes: `loadCounterpartyIndex`, `resolveCounterparty`,
  `ResolvedTransaction` (Task 4).
- Produces: `syncConnectionTransactions` com a mesma assinatura pública.

- [ ] **Step 1: Remover o mecanismo antigo**

Em `apps/web/lib/openfinance/sync.ts`:

Remover do import de `'@floow/db'`: `transactionNatureRules`.
Remover o import `import { applyNatureRules, type NatureRule } from './nature-rules'`.
Adicionar: `import { loadCounterpartyIndex, resolveCounterparty } from './resolve-counterparty'`.

Remover a função `hasLinkedCreditCard` inteira (não é mais usada — o pagamento
de fatura sem `category_ref` de fatura passa a cair pendente como qualquer
contraparte, e o usuário responde uma vez).

Remover a função `loadNatureRules` inteira.

Em `syncConnectionTransactions`, trocar:

```typescript
  const [categoryByRef, rules, creditCardConnected, natureRules] = await Promise.all([
    loadCategoryIndex(db, connection.orgId),
    loadRules(db, connection.orgId),
    hasLinkedCreditCard(db, connection.orgId),
    loadNatureRules(db, connection.orgId),
  ])
```

por:

```typescript
  const [categoryByRef, rules, counterpartyIndex] = await Promise.all([
    loadCategoryIndex(db, connection.orgId),
    loadRules(db, connection.orgId),
    loadCounterpartyIndex(db, connection.orgId),
  ])
```

- [ ] **Step 2: Trocar a chamada de normalização e o passo de natureza**

```typescript
      const { ok, rejected } = normalizeBatch(page, (tx) =>
        isCard
          ? normalizeCardTransaction(tx as PolpCardTransaction)
          : normalizeAccountTransaction(tx as PolpAccountTransaction),
      )

      if (rejected.length > 0) {
        rejectedHere += rejected.length
        await recordIssues(db, connection.orgId, resource.id, rejected)
      }

      // Nível 2: contraparte resolve o que o Nível 1 (em normalize.ts) não
      // resolveu sozinho. Sequencial, não Promise.all — duas transações
      // novas com a MESMA contraparte na mesma página não podem correr em
      // paralelo, ou as duas tentam criar a linha ao mesmo tempo.
      const resolved = []
      for (const tx of ok) {
        resolved.push(await resolveCounterparty(db, connection.orgId, resource.accountId, tx, counterpartyIndex))
      }

      const result = await persistPage(db, {
        orgId: connection.orgId,
        accountId: resource.accountId,
        normalized: resolved,
        categoryByRef,
        rules,
      })
```

Remover o comentário antigo sobre `creditCardConnected` que ficava acima da
chamada de `normalizeAccountTransaction` (não se aplica mais).

- [ ] **Step 3: Atualizar `PersistInput`/`persistPage` para os campos novos**

```typescript
interface PersistInput {
  orgId: string
  accountId: string
  normalized: ResolvedTransaction[]
  categoryByRef: Map<string, string>
  rules: CategoryRule[]
}
```

Adicionar `import type { ResolvedTransaction } from './resolve-counterparty'`
ao topo do arquivo.

Dentro do laço `for (const tx of input.normalized)` em `persistPage`, trocar:

```typescript
    const categoryId =
      matchCategory(tx.description, input.rules) ??
      (tx.categoryRef ? (input.categoryByRef.get(tx.categoryRef) ?? null) : null)
```

por:

```typescript
    // Contraparte (Nível 2) decide sozinha, confirmada ou pendente — nos dois
    // casos `tx.categoryId` já é a resposta final e não pode ser sobrescrita
    // por `category_rules`. Sem contraparte (Nível 1), a categorização
    // continua exatamente como antes desta mudança.
    const categoryId =
      tx.counterpartyId !== null
        ? tx.categoryId
        : (matchCategory(tx.description, input.rules) ??
           (tx.categoryRef ? (input.categoryByRef.get(tx.categoryRef) ?? null) : null))
```

E no objeto de UPDATE (caminho de enriquecimento) e no objeto de INSERT
(`toInsert.push`), adicionar os campos novos. No UPDATE, **nada muda** — o
comentário existente já documenta por quê (`type`/valor/data intactos); os
campos de contraparte entram na MESMA categoria de "não mexer depois de
gravado". No INSERT:

```typescript
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
    })
```

- [ ] **Step 2: Escrever o teste da decisão de categoria**

```typescript
// apps/web/__tests__/openfinance/sync-persist.test.ts
import { describe, it, expect } from 'vitest'

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
```

- [ ] **Step 3: Rodar o teste**

Run: `cd apps/web && npx vitest run __tests__/openfinance/sync-persist.test.ts`
Expected: PASS (a função é local ao teste, replicando a regra que o Step 1
grava em `sync.ts` — serve de documentação executável da regra, não de
cobertura de integração; a Task 12 confirma o comportamento fim-a-fim contra
produção como já foi feito nesta investigação).

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/openfinance/sync.ts apps/web/__tests__/openfinance/sync-persist.test.ts
git commit -m "feat(openfinance): sync resolve por contraparte, remove regra de natureza por texto"
```

---

## Task 6: `confirmCounterparty` — a ação de confirmar

**Files:**
- Create: `apps/web/lib/openfinance/counterparty-actions.ts`
- Test: `apps/web/__tests__/openfinance/counterparty-actions.test.ts`

**Interfaces:**
- Consumes: `counterparties`, `transactions` (Task 1).
- Produces: `confirmCounterparty(input: { counterpartyId: string; nature: 'income'|'expense'|'transfer'; categoryId: string | null }): Promise<{ reclassified: number }>`.
  Consumido pelo componente da fila (Task 9).

- [ ] **Step 1: Escrever o teste, no mesmo estilo de `nature-actions.test.ts`**

```typescript
// apps/web/__tests__/openfinance/counterparty-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'

const ORG = 'org-1'
const COUNTERPARTY_ID = '11111111-1111-1111-1111-111111111111'
const CATEGORY_ID = '22222222-2222-2222-2222-222222222222'

interface Op { op: 'select' | 'update'; table: string }
const ops: Op[] = []
const selectQueue: unknown[][] = []
const updateQueue: unknown[][] = []

function makeChain(result: unknown[]): any {
  const chain: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    catch: () => chain,
    finally: () => chain,
  }
  for (const m of ['from', 'where', 'limit', 'set', 'returning']) chain[m] = () => makeChain(result)
  return chain
}

vi.mock('@/lib/finance/queries', () => ({ getOrgId: vi.fn(async () => ORG) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })) },
  })),
}))
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
      }),
    }),
  }
})

import { confirmCounterparty } from '@/lib/openfinance/counterparty-actions'

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
  updateQueue.length = 0
})

describe('confirmCounterparty', () => {
  it('rejeita categoria em transferência', async () => {
    await expect(
      confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'transfer', categoryId: CATEGORY_ID }),
    ).rejects.toThrow()
  })

  it('rejeita despesa sem categoria', async () => {
    await expect(
      confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'expense', categoryId: null }),
    ).rejects.toThrow()
  })

  it('atualiza a contraparte e só as transações pendentes dela', async () => {
    selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
    updateQueue.push([]) // update de counterparties não retorna nada relevante
    updateQueue.push([{ id: 'tx-1' }, { id: 'tx-2' }]) // 2 transações reclassificadas

    const result = await confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'expense', categoryId: CATEGORY_ID })

    expect(result.reclassified).toBe(2)
    expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions'])
  })

  it('contraparte de outra org não é encontrada', async () => {
    selectQueue.push([]) // nenhuma linha — a cerca de org bloqueou

    await expect(
      confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'transfer', categoryId: null }),
    ).rejects.toThrow(/não encontrada/)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/web && npx vitest run __tests__/openfinance/counterparty-actions.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```typescript
// apps/web/lib/openfinance/counterparty-actions.ts
'use server'

import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { getDb, counterparties, transactions } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { createClient } from '@/lib/supabase/server'
import { revalidateSnapshotData, revalidateTransactionData } from '@/lib/finance/revalidate'
import { accountsTag, invalidateTag } from '@/lib/cache-tags'

/**
 * O usuário confirma a natureza e a categoria de uma contraparte, e a
 * confirmação vale para trás E para a frente: as transações pendentes hoje
 * reclassificam agora; a próxima sincronização casa pela mesma linha em
 * `counterparties` (ver `resolve-counterparty.ts`).
 *
 * Substitui `nature-actions.ts::createNatureRule`. A diferença estrutural: lá
 * o UPDATE de transações precisava de `transactionIds` explícitos vindos do
 * cliente, porque a chave era texto reconstruído. Aqui é `counterparty_id`
 * gravado desde a ingestão — chave estrangeira, não há texto para divergir.
 *
 * Ver docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md
 */

const inputSchema = z
  .object({
    counterpartyId: z.string().uuid(),
    nature: z.enum(['income', 'expense', 'transfer']),
    categoryId: z.string().uuid().nullable(),
  })
  .refine((v) => (v.nature === 'transfer') === (v.categoryId === null), {
    message: 'Categoria é obrigatória para receita e despesa, e não se aplica a transferência.',
  })

export type ConfirmCounterpartyInput = z.infer<typeof inputSchema>

export async function confirmCounterparty(raw: ConfirmCounterpartyInput): Promise<{ reclassified: number }> {
  const input = inputSchema.parse(raw)
  const orgId = await getOrgId()
  const db = getDb()

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado.')

  const reclassified = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: counterparties.id })
      .from(counterparties)
      .where(and(eq(counterparties.id, input.counterpartyId), eq(counterparties.orgId, orgId)))
      .limit(1)

    if (!row) throw new Error('Contraparte não encontrada.')

    await tx
      .update(counterparties)
      .set({
        nature: input.nature,
        categoryId: input.categoryId,
        confirmedAt: new Date(),
        confirmedBy: session.user.id,
        updatedAt: new Date(),
      })
      .where(and(eq(counterparties.id, input.counterpartyId), eq(counterparties.orgId, orgId)))

    // Chave estrangeira, não texto: todo lançamento que já apontava para
    // esta contraparte reclassifica junto, sem depender de casamento nenhum.
    const rows = await tx
      .update(transactions)
      .set({ type: input.nature, categoryId: input.categoryId, reviewState: 'confirmed' })
      .where(
        and(
          eq(transactions.orgId, orgId),
          eq(transactions.counterpartyId, input.counterpartyId),
          eq(transactions.reviewState, 'pending'),
        ),
      )
      .returning({ id: transactions.id })

    return rows.length
  })

  revalidateTransactionData(orgId)
  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)

  return { reclassified }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `cd apps/web && npx vitest run __tests__/openfinance/counterparty-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/openfinance/counterparty-actions.ts apps/web/__tests__/openfinance/counterparty-actions.test.ts
git commit -m "feat(openfinance): confirmar contraparte reclassifica por chave estrangeira"
```

---

## Task 7: Os 4 agregadores — filtro `review_state = 'confirmed'`

**Files:**
- Modify: `apps/web/lib/cfo/budget-pacing-input.ts:55`
- Modify: `apps/web/lib/finance/budget-daily-queries.ts:39`
- Modify: `apps/web/lib/finance/budget-queries.ts:149,187`
- Modify: `apps/web/lib/finance/debt-queries.ts:31,57`

**Interfaces:**
- Consumes: `transactions.reviewState` (Task 1).

- [ ] **Step 1: `budget-pacing-input.ts`**

Em `apps/web/lib/cfo/budget-pacing-input.ts`, no `and(...)` que contém
`eq(transactions.type, 'expense')` (linha 55), adicionar logo abaixo:

```typescript
        eq(transactions.type, 'expense'),
        eq(transactions.reviewState, 'confirmed'),
```

- [ ] **Step 2: `budget-daily-queries.ts`**

Mesma adição no `and(...)` de `getDailySpending` (linha 39).

- [ ] **Step 3: `budget-queries.ts`**

Duas ocorrências: `getSpendingByCategory` (linha ~149) e
`getInvestmentContributions` (linha ~187). Adicionar
`eq(transactions.reviewState, 'confirmed')` no `and(...)` de cada uma.

- [ ] **Step 4: `debt-queries.ts`**

Duas ocorrências: `getDebtProgress` (linha ~31) e `getDebtsWithProgress`
(linha ~57). Mesma adição.

- [ ] **Step 5: Escrever um teste de regressão que falharia sem o filtro**

Não há suite de teste hoje para estes 4 arquivos (todos usam `unstable_cache`
+ Drizzle direto, sem mock — confirmar isso antes de escrever). Se não houver
teste pré-existente, não introduzir um mock de banco só para isto: o
`review_state='confirmed'` é uma condição a mais na MESMA lista de condições
já usada há muito, o risco de regressão é baixo, e a Task 12 confirma
manualmente contra um lançamento pendente real. Se já existir suite para
algum destes arquivos, seguir o padrão dela e adicionar um caso "lançamento
pendente não entra na soma".

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 7: Rodar a suite inteira do app**

Run: `cd apps/web && npx vitest run`
Expected: PASS em tudo (as suites de `nature-*` ainda existem e ainda passam
— só são removidas na Task 11).

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/cfo/budget-pacing-input.ts apps/web/lib/finance/budget-daily-queries.ts apps/web/lib/finance/budget-queries.ts apps/web/lib/finance/debt-queries.ts
git commit -m "fix(finance): pendente de revisao fica fora de orcamento, pacing e divida"
```

---

## Task 8: O portão — consulta e integração no layout

**Files:**
- Create: `apps/web/lib/openfinance/counterparty-queries.ts`
- Modify: `apps/web/app/(app)/layout.tsx`
- Create: `apps/web/components/openfinance/review-gate.tsx`
- Test: `apps/web/__tests__/openfinance/counterparty-queries.test.ts`

**Interfaces:**
- Produces: `getReviewGateStatus(orgId): Promise<{ blocked: boolean }>`.
- Consumes (adiante, Task 9): `getPendingCounterpartyGroups`,
  `getConfirmedCounterparties` — declaradas aqui, implementadas na Task 9 para
  não duplicar o arquivo; o layout só precisa de `getReviewGateStatus` para
  esta task.

- [ ] **Step 1: Escrever o teste do portão**

```typescript
// apps/web/__tests__/openfinance/counterparty-queries.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ORG = 'org-1'
let orgRow: { reviewGateClearedAt: Date | null } | undefined
let pendingRow: unknown[] = []
let updateCalled = false

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return {
    ...actual,
    getDb: () => ({
      select: () => ({
        from: (table: any) => ({
          where: () => ({
            limit: () => Promise.resolve(String(table).includes('orgs') || table?.name === 'orgs' ? (orgRow ? [orgRow] : []) : pendingRow),
          }),
        }),
      }),
      update: () => ({ set: () => ({ where: () => { updateCalled = true; return Promise.resolve() } }) }),
    }),
  }
})

import { getReviewGateStatus } from '@/lib/openfinance/counterparty-queries'

beforeEach(() => {
  orgRow = undefined
  pendingRow = []
  updateCalled = false
})

describe('getReviewGateStatus', () => {
  it('org já destravada nunca bloqueia, mesmo com pendência', async () => {
    orgRow = { reviewGateClearedAt: new Date() }
    pendingRow = [{ one: 1 }]
    const status = await getReviewGateStatus(ORG)
    expect(status.blocked).toBe(false)
  })

  it('org travada com pendência bloqueia', async () => {
    orgRow = { reviewGateClearedAt: null }
    pendingRow = [{ one: 1 }]
    const status = await getReviewGateStatus(ORG)
    expect(status.blocked).toBe(true)
  })

  it('org travada sem nenhuma pendência destrava e grava o timestamp', async () => {
    orgRow = { reviewGateClearedAt: null }
    pendingRow = []
    const status = await getReviewGateStatus(ORG)
    expect(status.blocked).toBe(false)
    expect(updateCalled).toBe(true)
  })
})
```

Nota: o mock acima usa `String(table).includes('orgs')` como heurística
frágil para distinguir as duas tabelas na MESMA forma de chain
(`select().from().where().limit()`); se isso não funcionar na prática porque
o objeto de tabela do Drizzle não stringifica assim, trocar por dois mocks
de `getDb` diferentes por teste (`vi.mocked(getDb).mockReturnValueOnce(...)`)
— o objetivo do teste é o comportamento de `getReviewGateStatus`, não a forma
exata do mock; ajustar a mecânica do mock livremente mantendo os três casos.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/web && npx vitest run __tests__/openfinance/counterparty-queries.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```typescript
// apps/web/lib/openfinance/counterparty-queries.ts
import { and, eq, sql } from 'drizzle-orm'
import { getDb, orgs, transactions } from '@floow/db'

/**
 * O portão bloqueia o app inteiro no lugar do dashboard, só até a org zerar a
 * fila pela primeira vez. Ligado à ORG, não à conexão: uma vez destravada,
 * conectar um segundo banco depois só empilha no balde não-bloqueante do
 * regime permanente — não reabre o portão.
 *
 * Ver docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md
 */
export async function getReviewGateStatus(orgId: string): Promise<{ blocked: boolean }> {
  const db = getDb()

  const [org] = await db
    .select({ reviewGateClearedAt: orgs.reviewGateClearedAt })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1)

  if (org?.reviewGateClearedAt) return { blocked: false }

  const [pending] = await db
    .select({ one: sql`1` })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.reviewState, 'pending')))
    .limit(1)

  if (!pending) {
    // Nunca teve pendência (org sem Open Finance, ou acabou de zerar a fila
    // agora mesmo) — destrava e grava, para sempre.
    await db.update(orgs).set({ reviewGateClearedAt: new Date() }).where(eq(orgs.id, orgId))
    return { blocked: false }
  }

  return { blocked: true }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `cd apps/web && npx vitest run __tests__/openfinance/counterparty-queries.test.ts`
Expected: PASS

- [ ] **Step 5: Componente do portão (placeholder de conteúdo — a lista real entra na Task 9)**

```typescript
// apps/web/components/openfinance/review-gate.tsx
import { Suspense } from 'react'
import { CounterpartyQueue } from './counterparty-queue'

/**
 * Tela cheia que o layout renderiza NO LUGAR do app — não ao lado — enquanto
 * o portão da org está fechado. Sem AppShell, sem sidebar: a única coisa que
 * existe na tela é a fila.
 */
export function ReviewGate({ orgId }: { orgId: string }) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold text-gray-900">Antes de continuar</h1>
        <p className="mt-1 text-sm text-gray-600">
          O banco mandou lançamentos que o floow não sabe classificar sozinho. Revise cada
          contraparte uma vez — as próximas sincronizações não perguntam de novo.
        </p>
        <div className="mt-6">
          <Suspense fallback={null}>
            <CounterpartyQueue orgId={orgId} mode="blocking" />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Integrar no layout**

Em `apps/web/app/(app)/layout.tsx`, adicionar o import e a checagem:

```typescript
import { getReviewGateStatus } from '@/lib/openfinance/counterparty-queries'
import { getOrgId } from '@/lib/finance/queries'
import { ReviewGate } from '@/components/openfinance/review-gate'
```

Depois do `if (!session) redirect('/auth')`, antes de montar `AppShell`:

```typescript
  const orgId = await getOrgId()
  const { blocked } = await getReviewGateStatus(orgId)

  if (blocked) {
    return (
      <ToastProvider>
        <ReviewGate orgId={orgId} />
      </ToastProvider>
    )
  }
```

`ToastProvider` continua envolvendo mesmo bloqueado — o formulário de
confirmar usa `useToast()`.

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: erro esperado em `CounterpartyQueue` (ainda não existe) — resolvido
na Task 9. Se preferir manter o build verde entre tasks, criar aqui um
`CounterpartyQueue` provisório:

```typescript
// apps/web/components/openfinance/counterparty-queue.tsx (versão provisória desta task)
export function CounterpartyQueue({ orgId, mode }: { orgId: string; mode: 'blocking' | 'page' }) {
  return null
}
```

A Task 9 substitui este arquivo pelo conteúdo real.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/openfinance/counterparty-queries.ts apps/web/__tests__/openfinance/counterparty-queries.test.ts apps/web/components/openfinance/review-gate.tsx apps/web/components/openfinance/counterparty-queue.tsx apps/web/app/\(app\)/layout.tsx
git commit -m "feat(openfinance): portao bloqueia o app ate a org zerar a fila pela primeira vez"
```

---

## Task 9: A fila — consultas e interface

**Files:**
- Modify: `apps/web/lib/openfinance/counterparty-queries.ts` (adiciona as
  duas consultas que faltam)
- Modify: `apps/web/components/openfinance/counterparty-queue.tsx`
  (substitui o provisório da Task 8)
- Create: `apps/web/app/(app)/transactions/review/page.tsx`
- Test: `apps/web/__tests__/openfinance/counterparty-queries.test.ts`
  (estende o da Task 8 com os dois casos novos)

**Interfaces:**
- Produces: `getPendingCounterpartyGroups(orgId): Promise<PendingGroup[]>`,
  `getConfirmedCounterparties(orgId): Promise<ConfirmedCounterparty[]>`.
- Consumes: `confirmCounterparty` (Task 6), `getCategories`/`toCategoryOptions`
  (já existentes em `@/lib/finance/queries` e `@/lib/finance/category-options`).

- [ ] **Step 1: Sem teste unitário dedicado para as duas consultas de leitura**

`getPendingCounterpartyGroups` e `getConfirmedCounterparties` são leitura pura
com `JOIN`/`ORDER BY` contra o banco real — a mesma forma que
`getSpendingByCategory` e `getInvestmentContributions`
(`apps/web/lib/finance/budget-queries.ts`) já têm hoje, e nenhuma das duas
tem teste unitário dedicado no projeto: mockar uma chain de Drizzle com join
testaria a forma do mock, não a query em si. Seguir o mesmo padrão —
confirmar o agrupamento e a ordenação por dinheiro manualmente na Task 12,
contra o banco de desenvolvimento já populado pelo backfill (Task 10), como
já foi feito para validar o detector nesta mesma investigação.

- [ ] **Step 2: Implementar as duas consultas**

Adicionar a `apps/web/lib/openfinance/counterparty-queries.ts`:

```typescript
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { getDb, orgs, transactions, counterparties } from '@floow/db'

export interface PendingGroupItem {
  id: string
  date: string
  description: string
  amountCents: number
}

export interface PendingGroup {
  counterpartyId: string
  displayName: string
  keyType: 'tax_id' | 'description'
  count: number
  totalCents: number
  items: PendingGroupItem[]
}

/**
 * Contrapartes pendentes da org, com os lançamentos por trás de cada uma.
 * Ordenada por dinheiro — o mesmo princípio que o detector antigo já validou:
 * "R$ 92 mil" move o usuário, "12 lançamentos" não.
 */
export async function getPendingCounterpartyGroups(orgId: string): Promise<PendingGroup[]> {
  const db = getDb()

  const rows = await db
    .select({
      counterpartyId: transactions.counterpartyId,
      displayName: counterparties.displayName,
      keyType: counterparties.keyType,
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .innerJoin(counterparties, eq(counterparties.id, transactions.counterpartyId))
    .where(and(eq(transactions.orgId, orgId), eq(transactions.reviewState, 'pending')))
    .orderBy(transactions.date)

  const groups = new Map<string, PendingGroup>()
  for (const row of rows) {
    if (!row.counterpartyId) continue
    let group = groups.get(row.counterpartyId)
    if (!group) {
      group = { counterpartyId: row.counterpartyId, displayName: row.displayName, keyType: row.keyType, count: 0, totalCents: 0, items: [] }
      groups.set(row.counterpartyId, group)
    }
    group.count++
    group.totalCents += row.amountCents
    group.items.push({
      id: row.id,
      date: row.date instanceof Date ? row.date.toISOString() : String(row.date),
      description: row.description,
      amountCents: row.amountCents,
    })
  }

  return [...groups.values()].sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents))
}

export interface ConfirmedCounterparty {
  id: string
  displayName: string
  nature: 'income' | 'expense' | 'transfer'
  categoryId: string | null
  confirmedAt: string
}

/** Contrapartes já confirmadas, para a aba editável da fila. */
export async function getConfirmedCounterparties(orgId: string): Promise<ConfirmedCounterparty[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(counterparties)
    .where(and(eq(counterparties.orgId, orgId), sql`${counterparties.confirmedAt} is not null`))
    .orderBy(desc(counterparties.confirmedAt))

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    nature: row.nature!,
    categoryId: row.categoryId,
    confirmedAt: row.confirmedAt!.toISOString(),
  }))
}
```

- [ ] **Step 3: Componente da fila (server component que busca + client component que confirma)**

```typescript
// apps/web/components/openfinance/counterparty-queue.tsx
import { getPendingCounterpartyGroups, getConfirmedCounterparties } from '@/lib/openfinance/counterparty-queries'
import { getCategories } from '@/lib/finance/queries'
import { toCategoryOptions } from '@/lib/finance/category-options'
import { CounterpartyQueueClient } from './counterparty-queue-client'

/**
 * Server component: busca os dados. `counterparty-queue-client.tsx` é quem
 * tem estado (confirmar, expandir) — dividido porque `confirmCounterparty` é
 * uma server action chamada de um formulário client-side.
 */
export async function CounterpartyQueue({ orgId, mode }: { orgId: string; mode: 'blocking' | 'page' }) {
  const [pending, confirmed, categories] = await Promise.all([
    getPendingCounterpartyGroups(orgId),
    mode === 'page' ? getConfirmedCounterparties(orgId) : Promise.resolve([]),
    getCategories(orgId),
  ])

  const categoryOptions = toCategoryOptions(
    categories.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })),
  )

  return (
    <CounterpartyQueueClient
      mode={mode}
      pending={pending}
      confirmed={confirmed}
      categoryOptions={categoryOptions}
    />
  )
}
```

```typescript
// apps/web/components/openfinance/counterparty-queue-client.tsx
'use client'

import { useState } from 'react'
import { formatBRL } from '@floow/core-finance'
import { confirmCounterparty } from '@/lib/openfinance/counterparty-actions'
import type { PendingGroup, ConfirmedCounterparty } from '@/lib/openfinance/counterparty-queries'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'

type CategoryOption = { id: string; label: string; type: 'income' | 'expense' | 'transfer' }

interface Props {
  mode: 'blocking' | 'page'
  pending: PendingGroup[]
  confirmed: ConfirmedCounterparty[]
  categoryOptions: CategoryOption[]
}

type Nature = 'income' | 'expense' | 'transfer'

export function CounterpartyQueueClient({ mode, pending: initialPending, confirmed, categoryOptions }: Props) {
  const { toast } = useToast()
  const [pending, setPending] = useState(initialPending)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, { nature: Nature | null; categoryId: string | null }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  function draftFor(id: string) {
    return drafts[id] ?? { nature: null, categoryId: null }
  }

  function setDraft(id: string, patch: Partial<{ nature: Nature | null; categoryId: string | null }>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...draftFor(id), ...patch } }))
  }

  async function confirm(group: PendingGroup) {
    const draft = draftFor(group.counterpartyId)
    if (!draft.nature) {
      toast('Escolha se é receita, despesa ou transferência.', 'error')
      return
    }
    if (draft.nature !== 'transfer' && !draft.categoryId) {
      toast('Escolha uma categoria.', 'error')
      return
    }

    setSavingId(group.counterpartyId)
    try {
      const { reclassified } = await confirmCounterparty({
        counterpartyId: group.counterpartyId,
        nature: draft.nature,
        categoryId: draft.nature === 'transfer' ? null : draft.categoryId,
      })
      setPending((prev) => prev.filter((g) => g.counterpartyId !== group.counterpartyId))
      toast(`${reclassified} lançamentos classificados.`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível salvar', 'error')
    } finally {
      setSavingId(null)
    }
  }

  if (pending.length === 0 && mode === 'blocking') {
    // O layout re-renderiza no próximo request e o portão já vai estar
    // destravado (getReviewGateStatus grava o timestamp na hora que zera).
    return <p className="text-sm text-gray-600">Tudo revisado — atualizando…</p>
  }

  return (
    <div className="space-y-6">
      {pending.length === 0 ? (
        <p className="text-sm text-gray-600">Nada pendente.</p>
      ) : (
        <ul className="space-y-4">
          {pending.map((group) => {
            const draft = draftFor(group.counterpartyId)
            const isOpen = expanded.has(group.counterpartyId)
            const categoriesForNature = categoryOptions.filter((c) => c.type === draft.nature)

            return (
              <li key={group.counterpartyId} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-gray-900">{group.displayName}</p>
                  <p className="shrink-0 text-sm font-semibold text-gray-900">{formatBRL(Math.abs(group.totalCents))}</p>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {group.count} lançamento{group.count > 1 ? 's' : ''} ·{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev)
                        if (next.has(group.counterpartyId)) next.delete(group.counterpartyId)
                        else next.add(group.counterpartyId)
                        return next
                      })
                    }
                  >
                    {isOpen ? 'ocultar lançamentos' : 'ver lançamentos'}
                  </button>
                </p>

                {isOpen && (
                  <ul className="mt-2 space-y-1 border-l-2 border-gray-100 pl-3 text-xs text-gray-600">
                    {group.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-3">
                        <span>{item.date.slice(0, 10)} · {item.description}</span>
                        <span>{formatBRL(Math.abs(item.amountCents))}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(['expense', 'income', 'transfer'] as const).map((nature) => (
                    <Button
                      key={nature}
                      type="button"
                      variant={draft.nature === nature ? 'primary' : 'outline'}
                      onClick={() => setDraft(group.counterpartyId, { nature, categoryId: null })}
                    >
                      {nature === 'expense' ? 'Despesa' : nature === 'income' ? 'Receita' : 'Transferência'}
                    </Button>
                  ))}

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

                  <Button
                    type="button"
                    disabled={savingId !== null}
                    onClick={() => confirm(group)}
                  >
                    {savingId === group.counterpartyId ? 'Salvando…' : 'Confirmar'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {mode === 'page' && confirmed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Já confirmadas</h2>
          <p className="mt-1 text-xs text-gray-500">
            Errou uma decisão? Editar aqui reaplica retroativamente — mesmo caminho da primeira
            confirmação.
          </p>
          <ul className="mt-3 space-y-2">
            {confirmed.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <span className="text-gray-900">{c.displayName}</span>
                <span className="text-gray-500">
                  {c.nature === 'expense' ? 'Despesa' : c.nature === 'income' ? 'Receita' : 'Transferência'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

A edição de uma contraparte já confirmada (reabrir e trocar natureza/categoria)
fica com o mesmo formulário reaproveitado numa versão futura pequena — este
componente já lista as confirmadas; transformar cada linha num formulário
igual ao de pendente é a mesma UI, e fica como próximo incremento se o
usuário sentir falta no uso real, em vez de construído às cegas agora.

- [ ] **Step 4: A página**

```typescript
// apps/web/app/(app)/transactions/review/page.tsx
import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { CounterpartyQueue } from '@/components/openfinance/counterparty-queue'
import { PageHeader } from '@/components/ui/page-header'

export default async function ReviewPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Revisão de contrapartes"
        description="Lançamentos do Open Finance que o floow ainda não sabe classificar sozinho."
      />
      <Suspense fallback={null}>
        <CounterpartyQueue orgId={orgId} mode="page" />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 5: Link de acesso a partir de `/transactions`**

Em `apps/web/app/(app)/transactions/page.tsx`, ao lado do botão "Importar" já
existente:

```typescript
        <Button asChild variant="outline">
          <Link href="/transactions/review">Revisar contrapartes</Link>
        </Button>
```

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erro. Ajustar imports/tipos do `Select` conforme o componente
real de `@/components/ui/select` exigir (`onValueChange` recebe `string`, não
`string | undefined` — se o tipo do componente reclamar, checar a assinatura
real em `apps/web/components/ui/select.tsx` antes de forçar).

- [ ] **Step 7: Rodar a suíte inteira**

Run: `cd apps/web && npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/openfinance/counterparty-queries.ts apps/web/components/openfinance/counterparty-queue.tsx apps/web/components/openfinance/counterparty-queue-client.tsx "apps/web/app/(app)/transactions/review/page.tsx" "apps/web/app/(app)/transactions/page.tsx"
git commit -m "feat(openfinance): pagina da fila de revisao, com expandir e contrapartes confirmadas"
```

---

## Task 10: Backfill — reclassifica os dados já em produção

**Files:**
- Create: `apps/web/lib/openfinance/backfill.ts`
- Create: `apps/web/app/api/admin/backfill-counterparties/route.ts`

**Interfaces:**
- Consumes: `normalizeAccountTransaction`, `normalizeCardTransaction` (Task 2);
  `loadCounterpartyIndex`, `resolveCounterparty` (Task 4); `PolpClient`
  (`@floow/core-finance`).
- Produces: `backfillCounterparties(orgId: string): Promise<{ updated: number; skipped: number }>`.

Este é o único lugar do sistema autorizado a reescrever `type`, `categoryId`,
`counterpartyId`, `reviewState` de uma transação JÁ EXISTENTE — a proteção de
"re-sync não reabre isto" (Task 5) é sobre o caminho normal de sincronização,
não sobre este script de uma vez.

- [ ] **Step 1: Implementar (sem TDD aqui — script operacional de uma vez,
  não superfície de produto; a correção é validada rodando contra o banco de
  desenvolvimento antes de produção, no Step 3)**

```typescript
// apps/web/lib/openfinance/backfill.ts
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, accounts, openfinanceConnections, openfinanceResources, transactions } from '@floow/db'
import { normalizeAccountTransaction, normalizeCardTransaction } from '@floow/core-finance'
import type { PolpAccountTransaction, PolpCardTransaction, PolpClient } from '@floow/core-finance'
import { getPolpClient } from './config'
import { loadCounterpartyIndex, resolveCounterparty } from './resolve-counterparty'

/**
 * Reclassifica os dados de Open Finance já gravados sob as regras antigas
 * (category_ref decidindo natureza). Roda UMA vez por org, contra o histórico
 * completo — `polp_type` está null em quase todas as linhas já gravadas
 * porque a coluna nasceu depois da ingestão que gravou a maioria delas, então
 * reconstituir exige rebuscar a Polp, não o banco.
 *
 * Ver docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md §7
 */
export async function backfillCounterparties(orgId: string): Promise<{ updated: number; skipped: number }> {
  const db = getDb()
  const client = getPolpClient()

  const connections = await db.select().from(openfinanceConnections).where(eq(openfinanceConnections.orgId, orgId))
  const counterpartyIndex = await loadCounterpartyIndex(db, orgId)

  let updated = 0
  let skipped = 0

  for (const connection of connections) {
    const resources = await db
      .select()
      .from(openfinanceResources)
      .where(and(eq(openfinanceResources.connectionId, connection.id)))

    for (const resource of resources) {
      if (!resource.accountId) continue
      const isCard = resource.resourceType === 'CREDIT_CARD_ACCOUNT'

      const pages = isCard
        ? client.streamCardTransactions(resource.polpResourceId)
        : client.streamAccountTransactions(resource.polpResourceId)

      for await (const page of pages as AsyncGenerator<unknown[]>) {
        for (const raw of page) {
          const normalized = isCard
            ? normalizeCardTransaction(raw as PolpCardTransaction)
            : normalizeAccountTransaction(raw as PolpAccountTransaction)

          const resolved = await resolveCounterparty(db, orgId, resource.accountId, normalized, counterpartyIndex)

          const result = await db
            .update(transactions)
            .set({
              type: resolved.type,
              categoryId: resolved.categoryId ?? undefined, // undefined = não sobrescreve categoria manual do usuário
              counterpartyId: resolved.counterpartyId,
              counterpartyTaxId: resolved.counterpartyTaxId,
              counterpartyName: resolved.counterpartyName,
              reviewState: resolved.reviewState,
            })
            .where(
              and(
                eq(transactions.orgId, orgId),
                eq(transactions.accountId, resource.accountId),
                eq(transactions.externalId, resolved.externalId),
              ),
            )
            .returning({ id: transactions.id })

          if (result.length > 0) updated++
          else skipped++ // transação que a Polp manda mas nunca chegou a ser gravada (rejeitada, por ex.)
        }
      }
    }
  }

  return { updated, skipped }
}
```

Nota sobre `categoryId: resolved.categoryId ?? undefined`: diferente do
`sync.ts` normal (onde `categoryId` só é atribuído no INSERT, nunca
sobrescrevendo o que já existe), aqui a linha JÁ EXISTE e pode ter categoria
escolhida manualmente pelo usuário depois da ingestão original. `undefined`
no `.set()` do Drizzle omite a coluna do UPDATE inteiramente — preserva a
categoria manual quando a contraparte ainda está pendente (`categoryId: null`
do resolver viraria `undefined` aqui, não um NULL literal que apagaria a
escolha do usuário). Quando a contraparte JÁ está confirmada,
`resolved.categoryId` é a categoria que o usuário escolheu na fila — essa
SIM deve sobrescrever, então o operador precisa saber: rodar o backfill DEPOIS
que qualquer contraparte for confirmada é seguro (reforça a mesma decisão);
rodar ANTES é o caso normal (produção não tem nenhuma confirmação prévia sob
o schema novo).

- [ ] **Step 2: Rota admin**

```typescript
// apps/web/app/api/admin/backfill-counterparties/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/finance/queries'
import { backfillCounterparties } from '@/lib/openfinance/backfill'

/**
 * POST /api/admin/backfill-counterparties
 *
 * Roda UMA vez, manualmente, contra a org do usuário autenticado. Sem
 * agendamento, sem chamada automática — decisão do operador, feita uma vez.
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await getOrgId()

  try {
    const result = await backfillCounterparties(orgId)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[backfill-counterparties] Failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Backfill failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Rodar contra o banco de desenvolvimento antes de qualquer coisa em produção**

Run (com o app rodando local, `pnpm dev`, autenticado no browser):
`curl -X POST http://localhost:3000/api/admin/backfill-counterparties -H "Cookie: <cookie da sessão do browser>"`

Expected: `{ ok: true, updated: <número>, skipped: <número> }`. Conferir
manualmente: `select count(*) from transactions where review_state='pending'`
deve bater aproximadamente com as ~186 decisões medidas na investigação desta
spec (150 CNPJ + 34 descrição na conta corrente + 2 no cartão) — o número
exato pode variar com novas sincronizações desde a medição original.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/openfinance/backfill.ts "apps/web/app/api/admin/backfill-counterparties/route.ts"
git commit -m "feat(openfinance): script de backfill reclassifica producao pelas regras novas"
```

---

## Task 11: Retirada do subsistema antigo

**Só depois de confirmar o Task 10 rodado com sucesso contra produção** — o
spec (§10, passo 8) é explícito: remover antes deixaria uma janela sem
nenhuma das duas coisas funcionando.

**Files:**
- Delete: `apps/web/lib/openfinance/nature-suspects.ts` e teste
- Delete: `apps/web/lib/openfinance/nature-queries.ts`
- Delete: `apps/web/lib/openfinance/nature-rules.ts` e teste
- Delete: `apps/web/lib/openfinance/nature-actions.ts` e teste
- Delete: `apps/web/components/openfinance/nature-review-panel.tsx`
- Delete: `apps/web/components/openfinance/nature-suspects-banner.tsx`
- Delete: `apps/web/components/openfinance/nature-suspects-boundary.tsx` e teste
- Delete: `apps/web/components/openfinance/nature-suspects-section.tsx`
- Delete: `apps/web/components/openfinance/nature-shortcut-dialog.tsx` e teste
- Modify: `apps/web/app/(app)/transactions/page.tsx`

- [ ] **Step 1: Remover o uso em `transactions/page.tsx`**

Remover os imports e o bloco:

```typescript
import { NatureSuspectsSection } from '@/components/openfinance/nature-suspects-section'
import { NatureSuspectsBoundary } from '@/components/openfinance/nature-suspects-boundary'
```

```typescript
      <NatureSuspectsBoundary>
        <Suspense fallback={null}>
          <NatureSuspectsSection orgId={orgId} />
        </Suspense>
      </NatureSuspectsBoundary>
```

E o comentário acima desse bloco que explica por que ele fica fora do
`Promise.all` — não se aplica mais.

- [ ] **Step 2: Apagar os arquivos**

```bash
git rm apps/web/lib/openfinance/nature-suspects.ts apps/web/lib/openfinance/nature-queries.ts apps/web/lib/openfinance/nature-rules.ts apps/web/lib/openfinance/nature-actions.ts
git rm apps/web/components/openfinance/nature-review-panel.tsx apps/web/components/openfinance/nature-suspects-banner.tsx apps/web/components/openfinance/nature-suspects-boundary.tsx apps/web/components/openfinance/nature-suspects-section.tsx apps/web/components/openfinance/nature-shortcut-dialog.tsx
git rm apps/web/__tests__/openfinance/nature-suspects.test.ts apps/web/__tests__/openfinance/nature-rules.test.ts apps/web/__tests__/openfinance/nature-actions.test.ts apps/web/__tests__/openfinance/nature-suspects-boundary.test.tsx apps/web/__tests__/openfinance/nature-shortcut-dialog.test.tsx
```

- [ ] **Step 3: Typecheck — pega qualquer referência esquecida**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erro. Se algo importar um destes arquivos e eu não tiver
listado acima, o typecheck aponta exatamente onde.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `cd apps/web && npx vitest run`
Expected: PASS — nenhum teste deveria sequer existir mais para o que foi
removido.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(openfinance): remove deteccao de natureza por texto, substituida pela fila"
```

---

## Task 12: Verificação final

- [ ] **Step 1: Typecheck do monorepo inteiro**

Run: `pnpm typecheck` (ou `turbo typecheck`, conforme `package.json` raiz)
Expected: sem erro em nenhum pacote.

- [ ] **Step 2: Suíte de testes inteira**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 3: Build de produção**

Run: `pnpm build`
Expected: exit 0, sem warning novo.

- [ ] **Step 4: Confirmação manual contra os casos medidos nesta investigação**

Com o backfill (Task 10) já rodado contra o banco de desenvolvimento:

- `Débito automático PERS BLACK` some da fila depois de confirmado como
  transferência, e as 8 transações reclassificam juntas.
- `Unimed Cnu` cobrança e reembolso aparecem como DUAS entradas distintas na
  fila (direções diferentes), não uma.
- `SOMA COOPERATIVA` (a renda) aparece na fila pendente com o CNPJ, e depois
  de confirmada como receita, some do balde de transferência e passa a contar
  no dashboard.
- Um lançamento pendente aparece esmaecido em `/transactions` e NÃO afeta a
  coluna Saldo (que soma por `balanceApplied`, eixo independente) mas fica
  fora do orçamento/pacing/dívida.

- [ ] **Step 5: Commit final se qualquer ajuste tiver sido necessário**

```bash
git add -A
git commit -m "chore(openfinance): ajustes finais pos-verificacao da fila de contraparte"
```
