# Parte 1 — Fundação de dados

Índice e restrições globais: `2026-09-23-openfinance-investimentos.md`.

### Task 1: Migração e schema Drizzle

**Files:**
- Create: `supabase/migrations/00053_investimentos_open_finance.sql`
- Create: `packages/db/src/schema/numeric-number.ts`
- Modify: `packages/db/src/schema/investments.ts`
- Modify: `packages/db/src/schema/openfinance.ts` (tabela `openfinanceResources`)
- Modify: `packages/db/src/index.ts` (export do `numeric-number`)
- Modify: `docs/superpowers/specs/2026-09-23-openfinance-investimentos-design.md` (os ajustes do índice)
- Test: `packages/db/src/__tests__/investments-schema.test.ts`

**Interfaces:**
- Produces:
  - `numericNumber(name)` — coluna `numeric` lida/escrita como `number`.
  - `assetSourceEnum` = `['manual','openfinance']`.
  - `assetClassEnum` += `fund`, `treasury`, `credit_fixed_income`.
  - `eventTypeEnum` += `come_cotas`, `jcp`, `maturity`, `tax`, `other`.
  - `assets`: `source`, `assetSubtype`, `isin`, `cnpj`, `issuerName`, `indexer`, `preFixedRate`, `indexerPercentage`, `dueDate` (string AAAA-MM-DD); `ticker` anulável.
  - `portfolioEvents`: `quantity` numericNumber; `unitPrice`, `polpTransactionId`, `grossCents`, `netCents`, `incomeTaxCents`.
  - `assetBankPositions` (nova) e tipo `AssetBankPosition`.
  - `assetPositionSnapshots`: `quantityHeld` numericNumber; `costIsPartial`.
  - `openfinanceResources.assetId`; `openfinanceConnections.investmentAccountId`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao fim de `packages/db/src/__tests__/investments-schema.test.ts` (e troque os dois `toEqual` de enum existentes pelos valores novos):

```ts
import { assetSourceEnum, assetBankPositions, assetPositionSnapshots } from '../schema/investments'
import { openfinanceConnections, openfinanceResources } from '../schema/openfinance'

describe('investments schema: Open Finance', () => {
  it('asset_class inclui as classes novas', () => {
    expect(assetClassEnum.enumValues).toEqual([
      'br_equity', 'fii', 'etf', 'crypto', 'fixed_income', 'international',
      'fund', 'treasury', 'credit_fixed_income',
    ])
  })

  it('event_type inclui os tipos novos', () => {
    expect(eventTypeEnum.enumValues).toEqual([
      'buy', 'sell', 'dividend', 'interest', 'split', 'amortization',
      'come_cotas', 'jcp', 'maturity', 'tax', 'other',
    ])
  })

  it('asset_source separa manual de openfinance', () => {
    expect(assetSourceEnum.enumValues).toEqual(['manual', 'openfinance'])
  })

  it('assets tem os metadados do banco e ticker anulável', () => {
    for (const col of ['source', 'assetSubtype', 'isin', 'cnpj', 'issuerName', 'indexer', 'preFixedRate', 'indexerPercentage', 'dueDate']) {
      expect((assets as Record<string, unknown>)[col]).toBeDefined()
    }
    expect(assets.ticker.notNull).toBe(false)
  })

  it('portfolio_events guarda a movimentação da Polp', () => {
    for (const col of ['unitPrice', 'polpTransactionId', 'grossCents', 'netCents', 'incomeTaxCents']) {
      expect((portfolioEvents as Record<string, unknown>)[col]).toBeDefined()
    }
    expect(portfolioEvents.quantity.getSQLType()).toBe('numeric(28, 10)')
  })

  it('asset_bank_positions existe com dinheiro em centavos', () => {
    for (const col of ['assetId', 'orgId', 'referenceDate', 'quantity', 'unitPrice', 'grossCents', 'netCents', 'incomeTaxCents', 'iofCents', 'blockedCents', 'purchaseUnitPrice']) {
      expect((assetBankPositions as Record<string, unknown>)[col]).toBeDefined()
    }
  })

  it('snapshot marca custo parcial e openfinance_resources aponta para o ativo', () => {
    expect(assetPositionSnapshots.costIsPartial).toBeDefined()
    expect(openfinanceResources.assetId).toBeDefined()
    expect(openfinanceConnections.investmentAccountId).toBeDefined()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @floow/db test -- investments-schema`
Expected: FAIL (`assetSourceEnum` não exportado).

- [ ] **Step 3: Criar `numeric-number.ts`**

```ts
import { customType } from 'drizzle-orm/pg-core'

/**
 * `numeric` que chega ao TypeScript como `number`.
 *
 * Drizzle 0.40 devolve `numeric` como string, e trocar `quantity` de
 * `integer` para `numeric` mudaria o tipo em uma dúzia de arquivos da
 * carteira. Cota de fundo e fração de título precisam de casa decimal; um
 * `number` de 64 bits carrega 15 dígitos significativos, folga para
 * quantidade e preço unitário. Dinheiro NÃO usa isto — dinheiro é centavo
 * inteiro.
 */
export const numericNumber = customType<{ data: number; driverData: string }>({
  dataType() {
    return 'numeric(28, 10)'
  },
  fromDriver(value) {
    return Number(value)
  },
  toDriver(value) {
    return String(value)
  },
})
```

Em `packages/db/src/index.ts`, acrescente `export * from './schema/numeric-number'`.

- [ ] **Step 4: Alterar `packages/db/src/schema/investments.ts`**

Importe `boolean` de `drizzle-orm/pg-core` e `numericNumber` de `./numeric-number`. Aplique:

```ts
export const assetClassEnum = pgEnum('asset_class', [
  'br_equity', 'fii', 'etf', 'crypto', 'fixed_income', 'international',
  'fund', 'treasury', 'credit_fixed_income',
])

export const eventTypeEnum = pgEnum('event_type', [
  'buy', 'sell', 'dividend', 'interest', 'split', 'amortization',
  'come_cotas', 'jcp', 'maturity', 'tax', 'other',
])

/** De onde vem o ativo. `openfinance` é somente leitura na tela. */
export const assetSourceEnum = pgEnum('asset_source', ['manual', 'openfinance'])
```

Em `assets`: `ticker: text('ticker')` (sem `.notNull()`) e, após `notes`:

```ts
    source: assetSourceEnum('source').notNull().default('manual'),
    /** `investment_type` da Polp: CDB, LCI, DEBENTURES, CRI... */
    assetSubtype: text('asset_subtype'),
    isin: text('isin'),
    /** CNPJ do fundo ou do emissor. */
    cnpj: text('cnpj'),
    issuerName: text('issuer_name'),
    /** CDI, IPCA, SELIC, PRE_FIXADO, OUTROS. */
    indexer: text('indexer'),
    /** Fração: 0.15 = 15% a.a. */
    preFixedRate: numericNumber('pre_fixed_rate'),
    /** Fração: 1.0 = 100% do indexador. */
    indexerPercentage: numericNumber('indexer_percentage'),
    dueDate: date('due_date', { mode: 'string' }),
```

Em `portfolioEvents`: `quantity: numericNumber('quantity')` e, após `transactionId`:

```ts
    /** Preço unitário cheio vindo do banco. `price_cents` segue arredondado para a tela. */
    unitPrice: numericNumber('unit_price'),
    /** `id` da movimentação na Polp — upsert idempotente. */
    polpTransactionId: text('polp_transaction_id'),
    grossCents: integer('gross_cents'),
    netCents: integer('net_cents'),
    incomeTaxCents: integer('income_tax_cents'),
```

e no bloco de índices: `uqPolpTransaction: uniqueIndex('uq_portfolio_events_polp_tx').on(table.polpTransactionId),`.

Em `assetPositionSnapshots`: `quantityHeld: numericNumber('quantity_held').notNull(),` e `costIsPartial: boolean('cost_is_partial').notNull().default(false),`.

Nova tabela, antes dos tipos inferidos:

```ts
/**
 * Posição que o BANCO informou, uma linha por dia de referência.
 *
 * Para ativo do Open Finance é a fonte da verdade do valor: o histórico de
 * movimentações cobre ~12 meses, então reconstruir a posição pelos eventos
 * divergiria do banco em qualquer ativo mais antigo.
 */
export const assetBankPositions = pgTable(
  'asset_bank_positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
    referenceDate: date('reference_date', { mode: 'string' }).notNull(),
    quantity: numericNumber('quantity'),
    unitPrice: numericNumber('unit_price'),
    grossCents: integer('gross_cents'),
    netCents: integer('net_cents'),
    incomeTaxCents: integer('income_tax_cents'),
    iofCents: integer('iof_cents'),
    blockedCents: integer('blocked_cents'),
    purchaseUnitPrice: numericNumber('purchase_unit_price'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uqAssetDate: uniqueIndex('uq_asset_bank_positions_asset_date').on(table.assetId, table.referenceDate),
    idxOrg: index('idx_asset_bank_positions_org').on(table.orgId),
  })
)
```

e os tipos `export type AssetBankPosition = typeof assetBankPositions.$inferSelect` / `NewAssetBankPosition`.

- [ ] **Step 5: `openfinanceResources.assetId`**

Em `packages/db/src/schema/openfinance.ts`, importe `assets` de `./investments` e, logo após `accountId`:

```ts
    /** Ativo espelho quando o recurso é um investimento. Paralelo a `accountId`. */
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
```

e no bloco de índices:

```ts
    uqAsset: uniqueIndex('uq_openfinance_resources_asset')
      .on(table.assetId)
      .where(sql`asset_id IS NOT NULL`),
```

Em `openfinanceConnections`, logo após `products`:

```ts
    /**
     * Conta `brokerage` que recebe os eventos de investimento desta conexão
     * ("Investimentos · <Instituição>"). Criada na primeira ingestão.
     */
    investmentAccountId: uuid('investment_account_id').references(() => accounts.id, { onDelete: 'set null' }),
```

- [ ] **Step 6: Escrever a migração**

`supabase/migrations/00053_investimentos_open_finance.sql` (confirme o número antes):

```sql
-- supabase/migrations/00053_investimentos_open_finance.sql
-- =============================================================================
-- Investimentos via Open Finance (Polp)
-- -----------------------------------------------------------------------------
-- Ver docs/superpowers/specs/2026-09-23-openfinance-investimentos-design.md
--
-- A carteira passa a ter duas origens. O ativo manual segue como sempre:
-- posição calculada pelos eventos. O ativo do banco tem a posição que o BANCO
-- informa (asset_bank_positions), porque o histórico de movimentações do Open
-- Finance cobre ~12 meses e reconstruir pelos eventos divergiria.
--
-- quantity vira numeric: cota de fundo e fração de título não são inteiras.
-- =============================================================================

CREATE TYPE public.asset_source AS ENUM ('manual', 'openfinance');

ALTER TYPE public.asset_class ADD VALUE IF NOT EXISTS 'fund';
ALTER TYPE public.asset_class ADD VALUE IF NOT EXISTS 'treasury';
ALTER TYPE public.asset_class ADD VALUE IF NOT EXISTS 'credit_fixed_income';

ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'come_cotas';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'jcp';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'maturity';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'tax';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'other';

ALTER TABLE public.assets
  ALTER COLUMN ticker DROP NOT NULL,
  ADD COLUMN source             public.asset_source NOT NULL DEFAULT 'manual',
  ADD COLUMN asset_subtype      text,
  ADD COLUMN isin               text,
  ADD COLUMN cnpj               text,
  ADD COLUMN issuer_name        text,
  ADD COLUMN indexer            text,
  ADD COLUMN pre_fixed_rate     numeric(28, 10),
  ADD COLUMN indexer_percentage numeric(28, 10),
  ADD COLUMN due_date           date;

ALTER TABLE public.portfolio_events
  ALTER COLUMN quantity TYPE numeric(28, 10) USING quantity::numeric,
  ADD COLUMN unit_price          numeric(28, 10),
  ADD COLUMN polp_transaction_id text,
  ADD COLUMN gross_cents         integer,
  ADD COLUMN net_cents           integer,
  ADD COLUMN income_tax_cents    integer;

CREATE UNIQUE INDEX uq_portfolio_events_polp_tx
  ON public.portfolio_events(polp_transaction_id);

ALTER TABLE public.asset_position_snapshots
  ALTER COLUMN quantity_held TYPE numeric(28, 10) USING quantity_held::numeric,
  ADD COLUMN cost_is_partial boolean NOT NULL DEFAULT false;

ALTER TABLE public.openfinance_resources
  ADD COLUMN asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL;

ALTER TABLE public.openfinance_connections
  ADD COLUMN investment_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX uq_openfinance_resources_asset
  ON public.openfinance_resources(asset_id) WHERE asset_id IS NOT NULL;

CREATE TABLE public.asset_bank_positions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  asset_id            uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  reference_date      date NOT NULL,
  quantity            numeric(28, 10),
  unit_price          numeric(28, 10),
  gross_cents         integer,
  net_cents           integer,
  income_tax_cents    integer,
  iof_cents           integer,
  blocked_cents       integer,
  purchase_unit_price numeric(28, 10),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_asset_bank_positions_asset_date
  ON public.asset_bank_positions(asset_id, reference_date);
CREATE INDEX idx_asset_bank_positions_org ON public.asset_bank_positions(org_id);

ALTER TABLE public.asset_bank_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_bank_positions: members can select"
  ON public.asset_bank_positions FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "asset_bank_positions: members can insert"
  ON public.asset_bank_positions FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "asset_bank_positions: members can update"
  ON public.asset_bank_positions FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "asset_bank_positions: members can delete"
  ON public.asset_bank_positions FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

COMMENT ON TABLE public.asset_bank_positions IS
  'Posicao informada pelo banco via Open Finance, uma linha por dia de referencia. Fonte da verdade do valor de ativo com source = openfinance.';
```

- [ ] **Step 7: Rodar os testes e o typecheck**

Run: `pnpm --filter @floow/db test && pnpm --filter @floow/db typecheck && pnpm --filter web typecheck`
Expected: PASS. Se `web typecheck` acusar `ticker` possivelmente nulo em algum componente, troque a leitura por `asset.ticker ?? asset.name` naquele ponto (é a regra de exibição da spec).

Run: `node scripts/rls-coverage.mjs` (se aceitar rodar sem banco) — a tabela nova precisa aparecer com RLS.

- [ ] **Step 8: Atualizar a spec e commitar**

Na spec, seção "3. Modelo de dados", reflita os ajustes listados no índice do plano.

```bash
git add supabase/migrations/00053_investimentos_open_finance.sql packages/db/src/schema/numeric-number.ts packages/db/src/schema/investments.ts packages/db/src/schema/openfinance.ts packages/db/src/index.ts packages/db/src/__tests__/investments-schema.test.ts docs/superpowers/specs/2026-09-23-openfinance-investimentos-design.md
git commit -m "feat(investimentos): schema para carteira vinda do Open Finance"
```

**Não aplique a migração em produção** nesta tarefa; aplicar é passo do deploy, confirmado com o usuário.

