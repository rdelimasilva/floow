# Phase 03: Investments Engine - Research

**Researched:** 2026-03-10
**Domain:** Investment portfolio management, position calculation, PnL engine, financial event integration
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INV-01 | User can register assets (ações BR, FIIs, ETFs, cripto, renda fixa, internacional) | `assets` table with `asset_class` enum; org-scoped RLS; ticker + name fields |
| INV-02 | User can register holding events (compra, venda, dividendo, juros, split, amortização) | `portfolio_events` table with `event_type` enum; links asset + account; quantity + price fields |
| INV-03 | User can view consolidated position with average price | Pure function in core-finance: weighted average price from buy events net of sell events |
| INV-04 | User can view dividends and income details | Filter portfolio_events by type IN ('dividend', 'interest', 'amortization'); aggregate by asset/month |
| INV-05 | User can view PnL per asset and total | Realized PnL from sell events; unrealized = (current_price - avg_cost) * qty; manual price entry |
| INV-06 | User can view historical prices and asset evolution | `asset_prices` table (date, price_cents per asset); portfolio value chart over time |
| INV-07 | Investment events integrate with cash flow (aporte=debit, resgate=credit, dividend=credit) | Server action inserts both portfolio_event + transaction in db.transaction(); maps event_type to transaction_type |
| DASH-02 | Investment dashboard (portfolio, current value, PnL, allocation chart) | RSC page at /investments/dashboard; Recharts PieChart for allocation; existing ChartContainer |
| DASH-03 | Net worth evolution chart (time → patrimônio) | Query patrimony_snapshots over time; LineChart (Recharts); integrate investment value into snapshot |
| DASH-04 | Income dashboard (dividends, interest, monthly passive income) | RSC page at /investments/income; aggregate dividend/interest events by month; BarChart |
</phase_requirements>

---

## Summary

Phase 3 builds the Investments Engine on top of the completed Phase 2 Finance Engine. The core data model requires three new tables: `assets` (the registry of investable instruments), `portfolio_events` (every transaction against those instruments — buy, sell, dividend, split, etc.), and `asset_prices` (historical price snapshots for valuation). All tables follow the exact same org-scoping pattern as Phase 2: `org_id` FK to `orgs`, RLS via `get_user_org_ids()`, and indexes on FK columns.

The position calculation engine — average cost basis, PnL, split-adjusted quantities — is pure business logic with zero external dependencies. It belongs in `packages/core-finance/src/` following the `computeSnapshot` pattern from Phase 2: pure functions that accept typed inputs and return typed outputs, with no DB imports, making them trivially testable with Vitest. The cash flow integration (INV-07) follows the same `db.transaction()` pattern established in Plan 02-04 for atomicity between the `portfolio_events` insert and the corresponding `transactions` insert.

For the investment dashboards, the project already has Recharts (via shadcn/ui chart) installed and patterns established for RSC pages, parallel data fetching, and the ChartContainer wrapper. Phase 3 adds PieChart (allocation), LineChart (net worth evolution), and extends the existing BarChart usage (income by month). Historical price tracking is manual-entry only in v1 (INV-V2-01 for automatic updates is deferred); the `asset_prices` table supports this without schema changes in v2.

**Primary recommendation:** Add `packages/db/src/schema/investments.ts`, extend `core-finance` with position/PnL pure functions, wire cash flow integration via `db.transaction()`, and build three new RSC dashboard pages following the DASH-01 pattern.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.40.0 (installed) | Investment schema, typed queries | Project decision — already in use |
| postgres | ^3.4.0 (installed) | PostgreSQL driver | Already in use |
| zod | catalog: (installed) | Server action validation for event forms | Already in use across all phases |
| react-hook-form + @hookform/resolvers | installed | Portfolio event registration form | Already in use (TransactionForm pattern) |
| recharts | installed via shadcn/ui chart | PieChart (allocation), LineChart (evolution), BarChart (income) | Already installed; ChartContainer wrapper established |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | installed | Icons for asset classes and event types | Already in use throughout app |
| shadcn/ui chart | installed | ChartContainer, ChartTooltip wrappers | Required for consistent chart styling — established in Phase 2 |

### No New Dependencies Required

Phase 3 requires **zero new npm packages**. All necessary libraries were installed in Phases 1 and 2. The position calculation engine is pure TypeScript business logic.

**Installation:**
```bash
# No new packages — all dependencies already installed
```

---

## Architecture Patterns

### Recommended Project Structure

```
packages/db/src/schema/
└── investments.ts         # assets, portfolio_events, asset_prices tables + enums

packages/core-finance/src/
├── portfolio.ts           # Pure functions: computePositions(), computePnL()
├── income.ts              # Pure functions: aggregateDividends(), estimateMonthlyIncome()
└── __tests__/
    ├── portfolio.test.ts
    └── income.test.ts

apps/web/
├── lib/investments/
│   ├── queries.ts         # getAssets, getPositions, getPortfolioEvents, etc.
│   └── actions.ts         # createAsset, createPortfolioEvent (with INV-07 cash flow)
├── app/(app)/
│   └── investments/
│       ├── layout.tsx     # Optional: tab nav between sub-sections
│       ├── page.tsx       # Position list (INV-03, INV-05) — RSC
│       ├── dashboard/
│       │   └── page.tsx   # DASH-02: portfolio value, PnL, allocation pie
│       ├── income/
│       │   └── page.tsx   # DASH-04: dividends, interest, estimated income
│       └── new/
│           └── page.tsx   # Asset registration + event logging form
└── components/investments/
    ├── position-table.tsx         # Consolidated position per asset
    ├── allocation-chart.tsx       # PieChart by asset class
    ├── net-worth-evolution.tsx    # LineChart (DASH-03) from patrimony_snapshots
    ├── income-chart.tsx           # BarChart by month
    ├── portfolio-event-form.tsx   # Buy/sell/dividend event form
    └── asset-form.tsx             # Asset registration form
```

### Pattern 1: Investments Schema (Drizzle)

**What:** Three new tables in a dedicated `investments.ts` schema file, following `finance.ts` conventions exactly.

**When to use:** Plan 03-01 (schema migration).

```typescript
// packages/db/src/schema/investments.ts
import { pgTable, pgEnum, uuid, text, integer, date, timestamp, index, numeric } from 'drizzle-orm/pg-core'
import { orgs } from './auth'

export const assetClassEnum = pgEnum('asset_class', [
  'br_equity',      // Ações brasileiras (PETR4, VALE3)
  'fii',            // Fundos Imobiliários (HGLG11)
  'etf',            // ETFs (BOVA11, IVVB11)
  'crypto',         // Criptomoedas (BTC, ETH)
  'fixed_income',   // Renda fixa (CDB, LCI, Tesouro Direto)
  'international',  // Ações internacionais (AAPL, MSFT)
])

export const eventTypeEnum = pgEnum('event_type', [
  'buy',            // Compra — increases position
  'sell',           // Venda — decreases position, creates realized PnL
  'dividend',       // Dividendo — income event, credit to cash account
  'interest',       // Juros sobre capital próprio / rendimento renda fixa
  'split',          // Desdobramento — multiplies quantity, divides avg price
  'amortization',   // Amortização — partial capital return (renda fixa, FIIs)
])

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  ticker: text('ticker').notNull(),           // "PETR4", "BTC", "AAPL"
  name: text('name').notNull(),               // "Petrobras PN", "Bitcoin"
  assetClass: assetClassEnum('asset_class').notNull(),
  currency: text('currency').notNull().default('BRL'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  idxAssetsOrgId: index('idx_assets_org_id').on(t.orgId),
  idxAssetsTicker: index('idx_assets_ticker').on(t.orgId, t.ticker),
}))

export const portfolioEvents = pgTable('portfolio_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  // accountId: the brokerage/cash account this event affects (for INV-07 integration)
  accountId: uuid('account_id').notNull(),   // FK to accounts — enforced in application layer
  eventType: eventTypeEnum('event_type').notNull(),
  eventDate: date('event_date', { mode: 'date' }).notNull(),
  quantity: integer('quantity'),             // NULL for interest/dividend (no quantity change)
  // Price stored as integer cents — consistent with Phase 2 money convention
  priceCents: integer('price_cents'),        // price per unit at event time; NULL for splits
  totalCents: integer('total_cents'),        // total value of event (quantity * price or dividend amount)
  splitRatio: numeric('split_ratio', { precision: 10, scale: 4 }), // for splits: e.g., 3.0000 = 3-for-1
  notes: text('notes'),
  // Links to the auto-generated cash flow transaction (INV-07)
  transactionId: uuid('transaction_id'),     // FK to transactions — set after INV-07 integration
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  idxPortfolioEventsOrgId: index('idx_portfolio_events_org_id').on(t.orgId),
  idxPortfolioEventsAsset: index('idx_portfolio_events_asset_id').on(t.assetId),
  idxPortfolioEventsDate: index('idx_portfolio_events_date').on(t.orgId, t.eventDate),
}))

export const assetPrices = pgTable('asset_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  priceDate: date('price_date', { mode: 'date' }).notNull(),
  priceCents: integer('price_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  idxAssetPricesAssetDate: index('idx_asset_prices_asset_date').on(t.assetId, t.priceDate),
}))
```

### Pattern 2: Average Cost Calculation (Pure Function)

**What:** Weighted average cost calculation using the FIFO/average-cost method standard in Brazilian investment taxation.

**When to use:** Plan 03-02 (position calculation engine). Called by the positions query, never stored — always computed on the fly from events.

```typescript
// packages/core-finance/src/portfolio.ts

export interface PortfolioEvent {
  eventType: 'buy' | 'sell' | 'dividend' | 'interest' | 'split' | 'amortization'
  quantity: number | null
  priceCents: number | null
  totalCents: number | null
  splitRatio: string | null  // numeric comes back as string from postgres driver
  eventDate: Date
}

export interface Position {
  assetId: string
  ticker: string
  name: string
  assetClass: string
  quantityHeld: number          // current quantity after buys, sells, splits
  avgCostCents: number          // weighted average cost per unit (integer cents)
  totalCostCents: number        // total invested (quantity * avgCost)
  currentPriceCents: number     // from latest asset_prices entry (or last buy price)
  currentValueCents: number     // quantityHeld * currentPriceCents
  unrealizedPnLCents: number    // currentValue - totalCost
  unrealizedPnLPercent: number  // unrealizedPnL / totalCost * 100
  realizedPnLCents: number      // from sell events
  totalDividendsCents: number   // sum of dividend + interest + amortization events
}

/**
 * Computes consolidated position for a single asset from its event history.
 * Uses weighted average cost method (custo médio ponderado) — standard for
 * Brazilian investment taxation (IR).
 *
 * CRITICAL: Split events adjust quantity AND avgCost proportionally.
 * Example: 100 shares @ R$10 avg, 2-for-1 split → 200 shares @ R$5 avg.
 * Total cost basis does NOT change on a split.
 */
export function computePosition(
  events: PortfolioEvent[],
  currentPriceCents: number,
): { quantityHeld: number; avgCostCents: number; realizedPnLCents: number; totalDividendsCents: number } {
  let quantity = 0
  let totalCostCents = 0  // running total cost basis
  let realizedPnL = 0
  let dividends = 0

  // Process events in chronological order
  const sorted = [...events].sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())

  for (const ev of sorted) {
    if (ev.eventType === 'buy') {
      const qty = ev.quantity ?? 0
      const total = ev.totalCents ?? (qty * (ev.priceCents ?? 0))
      quantity += qty
      totalCostCents += total
    } else if (ev.eventType === 'sell') {
      const qty = ev.quantity ?? 0
      const avgCost = quantity > 0 ? totalCostCents / quantity : 0
      const costOfSold = avgCost * qty
      const proceeds = ev.totalCents ?? (qty * (ev.priceCents ?? 0))
      realizedPnL += proceeds - costOfSold
      quantity -= qty
      totalCostCents -= costOfSold
    } else if (ev.eventType === 'split') {
      const ratio = parseFloat(ev.splitRatio ?? '1')
      // Quantity multiplies, cost basis per share divides — total cost unchanged
      quantity = Math.round(quantity * ratio)
      // totalCostCents stays the same — avg cost adjusts automatically
    } else if (ev.eventType === 'dividend' || ev.eventType === 'interest' || ev.eventType === 'amortization') {
      dividends += ev.totalCents ?? 0
    }
  }

  const avgCostCents = quantity > 0 ? Math.round(totalCostCents / quantity) : 0

  return {
    quantityHeld: quantity,
    avgCostCents,
    realizedPnLCents: Math.round(realizedPnL),
    totalDividendsCents: dividends,
  }
}
```

### Pattern 3: Cash Flow Integration (INV-07)

**What:** Every portfolio event that moves cash (buy = debit, sell = credit, dividend = credit) automatically creates a corresponding entry in the `transactions` table inside a `db.transaction()` block.

**When to use:** Plan 03-03. This is the critical integration — cannot be skipped.

```typescript
// apps/web/lib/investments/actions.ts
'use server'
import { db, portfolioEvents, transactions, accounts } from '@floow/db'
import { sql } from 'drizzle-orm'

const CASH_FLOW_EVENT_TYPES = {
  buy:          { transactionType: 'expense', sign: -1 }, // aporte = saída de caixa
  sell:         { transactionType: 'income',  sign:  1 }, // resgate = entrada de caixa
  dividend:     { transactionType: 'income',  sign:  1 }, // dividendo = entrada de caixa
  interest:     { transactionType: 'income',  sign:  1 }, // juros = entrada de caixa
  amortization: { transactionType: 'income',  sign:  1 }, // amortização = entrada de caixa
  split:        null,                                      // split = no cash movement
}

export async function createPortfolioEvent(formData: FormData) {
  const orgId = await getOrgId()

  // ... parse and validate input with Zod ...

  const cashFlowMapping = CASH_FLOW_EVENT_TYPES[input.eventType]

  await db.transaction(async (tx) => {
    // 1. Insert portfolio event
    const [event] = await tx.insert(portfolioEvents).values({ /* ... */ }).returning()

    // 2. If cash moves, insert corresponding transaction (INV-07)
    if (cashFlowMapping && input.totalCents) {
      const signedAmount = cashFlowMapping.sign * Math.abs(input.totalCents)

      const [cashTx] = await tx.insert(transactions).values({
        orgId,
        accountId: input.accountId,
        type: cashFlowMapping.transactionType,
        amountCents: signedAmount,
        description: `${input.eventType}: ${input.ticker}`,
        date: input.eventDate,
      }).returning()

      // 3. Atomic balance update on the linked account
      await tx.update(accounts)
        .set({ balanceCents: sql`balance_cents + ${signedAmount}` })
        .where(eq(accounts.id, input.accountId))

      // 4. Link back to the portfolio event for audit trail
      await tx.update(portfolioEvents)
        .set({ transactionId: cashTx.id })
        .where(eq(portfolioEvents.id, event.id))
    }
  })

  revalidatePath('/investments')
  revalidatePath('/dashboard')
}
```

### Pattern 4: Patrimony Snapshot Extension for Investments

**What:** The existing `computeSnapshot` pure function currently only sums account balances. Phase 3 must extend it to include investment portfolio value. The cleanest approach is updating `computeAndSaveSnapshot` to also accept the latest portfolio value and add it to `liquidAssetsCents`.

**When to use:** Plan 03-03 (valuation integration).

The `patrimony_snapshots.breakdown` JSON field (currently storing account-type totals) should be extended to include an `investments` key representing total portfolio value at snapshot time.

### Pattern 5: RSC Dashboard Pages (DASH-02, DASH-03, DASH-04)

**What:** Follow the exact DASH-01 pattern from Plan 02-04: RSC page with parallel `Promise.all` fetches, render client chart components with data passed as props.

```typescript
// apps/web/app/(app)/investments/dashboard/page.tsx
export default async function InvestmentDashboardPage() {
  const orgId = await getOrgId()
  const [positions, snapshots, incomeEvents] = await Promise.all([
    getPositions(orgId),
    getPatrimonySnapshots(orgId, 12), // last 12 months
    getIncomeEvents(orgId, 12),
  ])

  return (
    <div className="space-y-6">
      <AllocationChart positions={positions} />      {/* DASH-02 PieChart */}
      <NetWorthEvolution snapshots={snapshots} />    {/* DASH-03 LineChart */}
      {/* ...  */}
    </div>
  )
}
```

### Anti-Patterns to Avoid

- **Storing computed positions in the DB:** Average cost and PnL are always recomputed from events. Never cache position data — event history is the source of truth. Materialized views are v2+.
- **Floating-point for quantity or price:** Quantity is stored as integer (number of shares/units). Price is stored as integer cents (BRL centavos or satoshis for crypto). Use `Math.round()` after any division.
- **Separate cash flow insert without db.transaction():** Buy/sell/dividend MUST be atomic with the corresponding `transactions` row. If the transaction fails, the portfolio event must roll back too.
- **Importing DB clients in pure functions:** Follow Phase 2 pattern: `portfolio.ts` = pure functions (no `@floow/db` imports), `portfolio-db.ts` = thin DB wrappers. Client components import only pure function types.
- **Skipping split adjustments in historical reports:** When displaying position at a past date, split events after that date must not be applied. Date-scoped computePosition is required for accurate historical views.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart components | Custom SVG charts | Recharts via shadcn/ui ChartContainer | Already installed; consistent styling; tooltip/legend handling is complex |
| Form validation | Manual validation | Zod + react-hook-form (established pattern) | Already in every form in the codebase; Controller pattern for Radix Select |
| DB transaction safety | Manual error handling | `db.transaction(async tx => {...})` | Already established in Plan 02-04; Drizzle handles rollback |
| Average cost calculation | Complex SQL aggregation | Pure TS function in core-finance | Easier to test, debug, and handle edge cases (splits, partials) |
| RLS policies | Application-layer tenant filtering | Supabase RLS + `get_user_org_ids()` | Established pattern — never filter by orgId only in application code |

**Key insight:** Investment position calculation appears simple (average price = total cost / total shares) but has many edge cases: partial sells change cost basis, splits change both quantity and avg price, amortization reduces principal for fixed income instruments. A pure TypeScript function with comprehensive tests is far safer than SQL aggregation for this logic.

---

## Common Pitfalls

### Pitfall 1: Integer Overflow for Large Portfolios

**What goes wrong:** `quantity * priceCents` in TypeScript can overflow JavaScript's safe integer range for high-value assets (e.g., 1000 BTC at R$500,000 each = 500,000,000,000 cents = 5e11, which fits in Number but approaches limits for large positions).

**Why it happens:** JavaScript `Number` is IEEE-754 double with 53-bit integer precision (max safe: ~9 quadrillion cents = ~90 trillion BRL). Practically safe for v1 but worth noting.

**How to avoid:** For v1 scope, `Number` is safe for all realistic portfolio sizes. Crypto quantities should be stored in smallest unit (satoshis for BTC = 10^8 per coin) — this is a future consideration, not a v1 blocker. Document the assumption.

**Warning signs:** Any amount > R$90 billion in a single calculation.

### Pitfall 2: Recharts PieChart Requires Explicit Height

**What goes wrong:** PieChart renders with 0px height if the parent container has no explicit height. The ChartContainer `className="min-h-[N]px w-full"` pattern from CashFlowChart is mandatory.

**Why it happens:** Recharts uses a ResponsiveContainer that sizes to its parent — if parent has no height, it collapses.

**How to avoid:** Always use `<ChartContainer config={...} className="min-h-[300px] w-full">` — the same pattern documented in `cash-flow-chart.tsx`.

**Warning signs:** Chart renders but is invisible, browser dev tools show 0px height.

### Pitfall 3: Client Component Bundling Node-Only Code

**What goes wrong:** Importing from the `@floow/core-finance` barrel `index.ts` in a client component pulls in `ofx-js` (Node-only) into the browser bundle, causing a build error.

**Why it happens:** Established and documented in Phase 2 decision: "Client components import directly from submodule (e.g., `@floow/core-finance/snapshot`) not barrel index."

**How to avoid:** Client components that need portfolio types or pure functions must import from the specific submodule path, e.g., `@floow/core-finance/src/portfolio`, NOT from `@floow/core-finance`.

**Warning signs:** `Cannot use import statement in a module` or `Module not found: ofx-js` in browser bundle.

### Pitfall 4: Split Events Affect Average Cost Calculation Order

**What goes wrong:** Processing events out of chronological order gives wrong average cost. A split before 10 buys must be applied at the right point in history.

**Why it happens:** Events are stored with a date — the computation must sort by `eventDate` ascending before folding.

**How to avoid:** The `computePosition` pure function must sort events by `eventDate` first (see Pattern 2 above). Tests should include multi-event sequences with splits interleaved between buys.

**Warning signs:** Average cost is correct without splits but wrong after a split event is added.

### Pitfall 5: Missing Index on `portfolio_events.asset_id`

**What goes wrong:** The position computation query fetches all events for an asset. Without an index on `asset_id`, this becomes a full table scan as the event log grows.

**Why it happens:** Same root cause as Phase 2 pitfall — RLS causes full table scans if indexes are missing on FK columns.

**How to avoid:** Include `idx_portfolio_events_asset_id` in the migration (Pattern 1 above already includes it).

**Warning signs:** Slow position pages as event log grows; detectable with `EXPLAIN ANALYZE` on the events query.

### Pitfall 6: INV-07 Cash Flow Double-Counting

**What goes wrong:** If dividend events are counted in both `portfolio_events.totalCents` (income dashboard) AND the linked `transactions` row (cash flow dashboard), reports show double the income.

**Why it happens:** The linked transaction is necessary for account balance accuracy, but income dashboards must query from `portfolio_events` not `transactions` to avoid double-counting.

**How to avoid:** Income dashboards (DASH-04) query `portfolio_events` filtered by event_type IN ('dividend', 'interest', 'amortization'). Cash flow dashboards query `transactions`. The two never mix.

**Warning signs:** Total income in DASH-04 equals exactly 2x expected income; compare portfolio event totals with transaction totals.

### Pitfall 7: Fixed Income Quantity Convention

**What goes wrong:** For fixed income instruments (CDB, LCI, Tesouro Direto), "quantity" is often ambiguous — some products are quantity=1 with a variable value, others have face value units.

**Why it happens:** Brazilian fixed income products have diverse conventions.

**How to avoid:** For v1, use `quantity = 1` for fixed income instruments with `priceCents` representing the total invested value. Document this convention in the asset form UI with a helper text.

**Warning signs:** Impossible quantity values in the position table for fixed income assets.

---

## Code Examples

Verified patterns from project source code:

### RLS Policy Pattern (matching 00002_finance.sql)

```sql
-- supabase/migrations/00003_investments.sql
CREATE TYPE asset_class AS ENUM ('br_equity', 'fii', 'etf', 'crypto', 'fixed_income', 'international');
CREATE TYPE event_type AS ENUM ('buy', 'sell', 'dividend', 'interest', 'split', 'amortization');

CREATE TABLE public.assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  ticker      text NOT NULL,
  name        text NOT NULL,
  asset_class asset_class NOT NULL,
  currency    text NOT NULL DEFAULT 'BRL',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_assets_org_id ON public.assets USING btree (org_id);
CREATE INDEX idx_assets_ticker ON public.assets USING btree (org_id, ticker);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assets: members can select"
  ON public.assets FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "assets: members can insert"
  ON public.assets FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "assets: members can update"
  ON public.assets FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "assets: members can delete"
  ON public.assets FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
-- (repeat for portfolio_events, asset_prices)
```

### Vitest Pure Function Test Pattern

```typescript
// packages/core-finance/src/__tests__/portfolio.test.ts
import { describe, it, expect } from 'vitest'
import { computePosition } from '../portfolio'

const makeEvent = (overrides: Partial<PortfolioEvent>): PortfolioEvent => ({
  eventType: 'buy',
  quantity: 100,
  priceCents: 1000,   // R$10.00
  totalCents: 100000, // R$1000.00
  splitRatio: null,
  eventDate: new Date('2024-01-15'),
  ...overrides,
})

describe('computePosition', () => {
  it('computes average cost from single buy', () => {
    const events = [makeEvent({ quantity: 100, priceCents: 1000, totalCents: 100000 })]
    const result = computePosition(events, 1200)
    expect(result.quantityHeld).toBe(100)
    expect(result.avgCostCents).toBe(1000)
  })

  it('adjusts average cost on split', () => {
    const events = [
      makeEvent({ quantity: 100, priceCents: 2000, totalCents: 200000 }),
      makeEvent({ eventType: 'split', quantity: null, priceCents: null, totalCents: null, splitRatio: '2.0000', eventDate: new Date('2024-02-01') }),
    ]
    const result = computePosition(events, 1000)
    expect(result.quantityHeld).toBe(200)
    expect(result.avgCostCents).toBe(1000) // 200000 / 200 = 1000
  })
})
```

### Allocation PieChart (Recharts via shadcn/ui ChartContainer)

```typescript
'use client'
// apps/web/components/investments/allocation-chart.tsx
import { PieChart, Pie, Cell } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

const ASSET_CLASS_COLORS: Record<string, string> = {
  br_equity:    '#2563eb',
  fii:          '#7c3aed',
  etf:          '#059669',
  crypto:       '#d97706',
  fixed_income: '#0891b2',
  international:'#dc2626',
}

export function AllocationChart({ positions }: { positions: Position[] }) {
  const data = groupByAssetClass(positions) // { name, valueCents }
  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <PieChart>
        <Pie data={data} dataKey="valueCents" nameKey="name" cx="50%" cy="50%" outerRadius={120}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={ASSET_CLASS_COLORS[entry.assetClass] ?? '#6b7280'} />
          ))}
        </Pie>
        <ChartTooltip content={<ChartTooltipContent />} />
      </PieChart>
    </ChartContainer>
  )
}
```

### Net Worth Evolution LineChart (DASH-03)

```typescript
'use client'
// apps/web/components/investments/net-worth-evolution.tsx
import { LineChart, Line, XAxis, CartesianGrid } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

// Source: same ChartContainer pattern as cash-flow-chart.tsx (Phase 2)
export function NetWorthEvolution({ snapshots }: { snapshots: PatrimonySnapshot[] }) {
  const data = snapshots
    .sort((a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime())
    .map(s => ({ date: String(s.snapshotDate), netWorthCents: s.netWorthCents }))

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line type="monotone" dataKey="netWorthCents" stroke="#2563eb" dot={false} />
      </LineChart>
    </ChartContainer>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom chart libraries | Recharts via shadcn/ui ChartContainer | Phase 2 (installed) | Use ChartContainer — never raw Recharts ResponsiveContainer |
| Prisma ORM | Drizzle ORM | Phase 1 (project decision) | All schema in `packages/db/src/schema/` |
| API routes for mutations | Next.js 15 Server Actions | Phase 1/2 pattern | All writes use `'use server'` actions with FormData or typed args |
| Read-modify-write balance updates | Atomic SQL `balance_cents + ${delta}` | Phase 2 (02-02) | All balance mutations use this pattern — never fetch then update |
| Separate SQL calls | `db.transaction(async tx => {...})` | Phase 2 (02-04) | All multi-table mutations must be wrapped |

**Deprecated/outdated in this project:**
- `db` singleton (from `packages/db/src/client.ts`): Use `createDb(DATABASE_URL)` per request — the singleton throws at build time. Pattern established in Phase 2.
- Barrel `index.ts` imports in client components: Always use submodule paths to avoid bundling Node-only code (established Phase 2 decision).

---

## Open Questions

1. **Quantity precision for crypto**
   - What we know: BTC is stored in satoshis (10^8 per coin) by exchanges; ETH in wei (10^18 per coin)
   - What's unclear: v1 will track crypto in whole units (e.g., 0.5 BTC) — should quantity be stored as integer (satoshis) or float?
   - Recommendation: For v1, store crypto quantity as integer (e.g., 50000000 = 0.5 BTC in satoshis) with a `quantityScale` column, OR store as text and parse. Simplest: store in whole units as integer * 10^8. Document the assumption. This is a naming/documentation problem, not a blocker.

2. **Navigation: add "Investimentos" to app layout**
   - What we know: `apps/web/app/(app)/layout.tsx` hardcodes the nav links
   - What's unclear: Should Phase 3 add a single "Investimentos" nav link or multiple (Portfolio, Renda, Dashboard)?
   - Recommendation: Add a single "Investimentos" link to `/investments` in the layout; let the investments section have its own sub-navigation via tabs (`shadcn/ui Tabs` component is already installed).

3. **Historical price entry UX**
   - What we know: INV-06 requires viewing historical prices; INV-V2-01 (automatic updates) is deferred
   - What's unclear: How does the user enter the current price for PnL calculation? Separate price entry form? As part of event logging?
   - Recommendation: Add a "current price" field on the asset form and a simple "update price" action that inserts into `asset_prices`. The position table shows "last known price" from the most recent `asset_prices` entry for that asset.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `packages/core-finance/vitest.config.ts` |
| Quick run command | `cd packages/core-finance && pnpm test` |
| Full suite command | `pnpm --filter @floow/core-finance test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INV-03 | Average cost calculation from buy events | unit | `pnpm --filter @floow/core-finance test -- portfolio` | ❌ Wave 0 |
| INV-03 | Average cost recalculates after partial sell | unit | `pnpm --filter @floow/core-finance test -- portfolio` | ❌ Wave 0 |
| INV-02 | Split event adjusts quantity AND avg price proportionally | unit | `pnpm --filter @floow/core-finance test -- portfolio` | ❌ Wave 0 |
| INV-05 | Realized PnL computed correctly from sell events | unit | `pnpm --filter @floow/core-finance test -- portfolio` | ❌ Wave 0 |
| INV-04 | Dividend aggregation by month | unit | `pnpm --filter @floow/core-finance test -- income` | ❌ Wave 0 |
| INV-07 | Cash flow integration (buy=expense, dividend=income) | manual-only | N/A — requires Supabase test DB | manual |
| DASH-02 | Portfolio allocation chart renders | manual-only | N/A — browser render | manual |
| DASH-03 | Net worth evolution chart renders | manual-only | N/A — browser render | manual |
| DASH-04 | Income dashboard renders dividend history | manual-only | N/A — browser render | manual |
| INV-01 | Asset registry CRUD | manual-only | N/A — requires Supabase test DB | manual |
| INV-06 | Historical price entry and display | manual-only | N/A — requires Supabase test DB | manual |

### Sampling Rate

- **Per task commit:** `pnpm --filter @floow/core-finance test`
- **Per wave merge:** `pnpm --filter @floow/core-finance test && pnpm --filter @floow/db typecheck && pnpm --filter @floow/web typecheck`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/core-finance/src/__tests__/portfolio.test.ts` — covers INV-03, INV-02, INV-05
- [ ] `packages/core-finance/src/__tests__/income.test.ts` — covers INV-04

*(No new framework install needed — Vitest already configured in `packages/core-finance/vitest.config.ts`)*

---

## Sources

### Primary (HIGH confidence)

- Project source — `packages/db/src/schema/finance.ts` (established Drizzle schema pattern)
- Project source — `packages/db/src/schema/auth.ts` (RLS pattern: get_user_org_ids)
- Project source — `supabase/migrations/00001_foundation.sql`, `00002_finance.sql` (SQL migration pattern)
- Project source — `packages/core-finance/src/snapshot.ts` (pure function pattern)
- Project source — `packages/core-finance/src/snapshot-db.ts` (pure/db split pattern)
- Project source — `apps/web/lib/finance/actions.ts` (db.transaction, server action, atomic balance update patterns)
- Project source — `apps/web/components/finance/cash-flow-chart.tsx` (ChartContainer + min-h pattern)
- Project source — `packages/core-finance/vitest.config.ts` (test framework config)

### Secondary (MEDIUM confidence)

- Brazilian investment taxation documentation: weighted average cost (custo médio ponderado) is the legally required method for calculating IR on equity sales in Brazil
- Recharts PieChart documentation: requires explicit height container

### Tertiary (LOW confidence)

- Crypto quantity conventions: satoshi/wei storage is common practice but not verified against official Brazilian exchange APIs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already installed, verified in package.json files
- Architecture: HIGH — all patterns directly derived from existing project source code
- Pitfalls: HIGH — pitfalls 2, 3, 4, 5 are direct extensions of documented Phase 2 pitfalls
- Position calculation math: HIGH — weighted average cost is standard Brazilian financial practice; algorithm is well-known
- Pitfall 1 (integer overflow): MEDIUM — safe for v1 scope, documented assumption

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable domain — no external APIs, no version-sensitive libraries being added)
