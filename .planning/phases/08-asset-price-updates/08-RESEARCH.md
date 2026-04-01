# Phase 8: Asset Price Updates - Research

**Researched:** 2026-03-31
**Domain:** Asset price ingestion — B3 equities (brapi.dev), crypto (CoinGecko), fixed income indicators (BCB), portfolio snapshot recomputation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from STATE.md / PROJECT decisions)

### Locked Decisions
- B3 prices: brapi.dev (Startup plan — verify exact price at brapi.dev/pricing before purchase)
- Crypto prices: CoinGecko Demo API (free, 10k req/month, no library needed)
- BCB indicators (CDI/SELIC/IPCA): BCB dados abertos API (free, no auth, plain fetch)
- `global_asset_prices` table is global (no orgId) — one row per (ticker, date)
- Scheduling: Netlify Scheduled Function (existing cfo-daily.mts pattern)
- Price cron at 19:00 UTC weekdays (90-min buffer after B3 close at 17:30 BRT)
- `pricing_type` enum on assets (`market_quoted` vs `accrual_based`)
- `coingecko_id` column needed on assets table
- No new npm libraries for price APIs — plain `fetch()` only
- Integer cents for all money values; `Math.round(parseFloat(price.toFixed(2)) * 100)` at API boundary

### Claude's Discretion
- Whether to store CDI/SELIC in `global_asset_prices` (synthetic tickers) or a separate table
- Whether snapshot recomputation after price update runs inside the cron or is triggered separately
- File organization for new price-related server actions (given actions.ts 500-line constraint)
- coingecko_id seed strategy (migration vs asset-creation UI)

### Deferred Ideas (OUT OF SCOPE)
- Open Finance bank connections (Phase 9)
- Real-time sub-5-minute B3 prices
- International stock prices (USD)
- Historical price backfill (can add later)
- Price staleness alerts UI (can defer to v2.1)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRICE-01 | System auto-updates EOD prices for B3 equities, FIIs, ETFs, BDRs via daily cron | brapi.dev `GET /api/quote/{tickers}` returns `regularMarketPrice`; Netlify cron at 19:00 UTC weekdays; existing `cfo-daily.mts` pattern |
| PRICE-02 | System auto-updates crypto prices daily via CoinGecko | CoinGecko `GET /simple/price?ids={coingecko_ids}&vs_currencies=brl`; requires `coingecko_id` column on assets; Demo free tier sufficient |
| PRICE-03 | System fetches CDI/SELIC economic indicators from BCB daily for fixed income calculation | BCB API series 12 (CDI), 11 (SELIC), 433 (IPCA); new `computeAccrualPrice()` uses 252-business-day convention (NOT `estimateAssetValue()` which uses wrong calendar-day formula); rates stored in `economic_indicators` table |
| PRICE-04 | Investment portfolio shows updated values with today's prices without user action | Requires wiring `global_asset_prices` into `getLatestPrices()` and `recomputeOrgPositionSnapshots()`; existing `assetPositionSnapshots` table handles display |
</phase_requirements>

---

## Summary

Phase 8 delivers live market prices to the portfolio without any user action. The technical work is three separate fetch-and-upsert pipelines (brapi.dev for B3, CoinGecko for crypto, BCB for indicators) orchestrated by a single Netlify Scheduled Function, plus the critical integration work of wiring the new `global_asset_prices` table into the existing snapshot recomputation pipeline.

The API clients themselves are trivial (plain `fetch()`, no libraries). The real complexity lives in two places: (1) the two-table price architecture — `global_asset_prices` (automated, global, by ticker) feeding into the existing `asset_prices` (per-org, manual overrides) lookup chain, and (2) the post-fetch snapshot recomputation — after the cron upserts prices, position snapshots for all orgs holding those tickers must be recomputed to surface the new prices on the investments page.

The existing `assetPositionSnapshots` table and `recomputeOrgPositionSnapshots()` function already handle rendering. This phase's job is to populate `global_asset_prices` on a schedule and connect it to the snapshot pipeline.

**Primary recommendation:** Build in this order: migrations → brapi client → CoinGecko client → BCB client → orchestrator → API route → Netlify cron → price query integration → snapshot trigger. UI work (displaying `pricing_type` badges, last-updated timestamp) is additive and can come last.

---

## Migration Numbers

**CRITICAL: ARCHITECTURE.md contains wrong migration numbers.** Migrations 00022 and 00023 are already taken:
- `00021_cfo_insights.sql` — exists
- `00022_cfo_chat.sql` — exists
- `00023_simulation_scenarios.sql` — exists

**Correct numbers for Phase 8:**
- `00024_global_asset_prices.sql` — `global_asset_prices` table (no RLS; service-role writes, authenticated reads)
- `00025_assets_pricing_metadata.sql` — `ALTER TABLE assets ADD COLUMN pricing_type text` + `ADD COLUMN coingecko_id text`
- `00026_economic_indicators.sql` — `economic_indicators` table for CDI/SELIC/IPCA rates (no RLS; service-role writes)

Combining `pricing_type` and `coingecko_id` in one migration is cleaner than splitting them.

---

## Standard Stack

### Core (no new npm packages needed)
| Component | Version/Provider | Purpose | Auth |
|-----------|-----------------|---------|------|
| brapi.dev | Startup plan | B3 equities, FIIs, ETFs, BDRs EOD prices | Bearer token in Netlify env |
| CoinGecko API | Demo (free) | Crypto prices in BRL | API key optional on Demo; `x-cg-demo-api-key` header if needed |
| BCB dados abertos | Free, no auth | CDI (series 12), SELIC (series 11), IPCA (series 433) | None |
| Netlify Scheduled Functions | Existing pattern | Cron trigger at 19:00 UTC weekdays | Service role key to call internal API route |

### No New Libraries
All three price APIs use plain `fetch()`. No npm packages required.

```bash
# No new packages to install for Phase 8
# (coingecko_id seed mapping uses plain SQL in migration)
```

---

## Architecture Patterns

### File Map — New Files

```
netlify/functions/
└── price-update.mts              # Scheduled function: cron trigger → calls /api/prices/update-daily

apps/web/
├── app/api/prices/
│   └── update-daily/
│       └── route.ts             # POST route: authenticated with service role key; orchestrates fetch+upsert+recompute
└── lib/prices/
    ├── brapi-client.ts          # fetch wrapper: batch B3 tickers → [{ticker, priceCents}]
    ├── coingecko-client.ts      # fetch wrapper: batch coingecko_ids → [{ticker, priceCents}]
    ├── bcb-client.ts            # fetch wrapper: CDI/SELIC/IPCA → {cdi, selic, ipca}
    ├── price-actions.ts         # server actions: manual price override (replaces adding to actions.ts)
    └── update-daily.ts          # orchestrator: collect tickers → fetch → upsert → trigger snapshots
```

### Modified Files

| File | Change | Concern |
|------|--------|---------|
| `packages/db/src/schema/investments.ts` | ADD `globalAssetPrices` table + `pricingType`/`coingeckoId` columns on `assets` | Drizzle schema must match migration |
| `packages/db/src/index.ts` | ADD exports for `globalAssetPrices` | — |
| `apps/web/lib/investments/queries.ts` | MODIFY `getLatestPrices()` to prefer `global_asset_prices` for market_quoted assets | Core integration seam — see Pattern 2 |
| `apps/web/lib/investments/position-snapshots.ts` | MODIFY `getLatestPriceCents()` to check `global_asset_prices` first | Must match queries.ts logic |
| `packages/core-finance/src/index.ts` | ADD export for any new pure functions | — |
| `supabase/migrations/` | ADD 00024, 00025 | — |

**File size constraint (CLAUDE.md: 500-line limit):**
- `apps/web/lib/investments/actions.ts` is currently **585 lines** — already over limit
- New price-related server actions (manual price override) MUST go in `lib/prices/price-actions.ts`, not `actions.ts`
- Do not add any code to `actions.ts` in this phase

---

### Pattern 1: Netlify Cron → API Route (existing pattern, follow exactly)

```typescript
// netlify/functions/price-update.mts
import type { Config } from '@netlify/functions'

export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL
  if (!siteUrl) {
    console.error('[price-update] No URL env var')
    return new Response('No URL configured', { status: 500 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    console.error('[price-update] No SUPABASE_SERVICE_ROLE_KEY')
    return new Response('No service role key', { status: 500 })
  }

  const response = await fetch(`${siteUrl}/api/prices/update-daily`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
  })

  return new Response(await response.text(), { status: response.status })
}

export const config: Config = {
  schedule: '0 19 * * 1-5',  // 19:00 UTC weekdays (17:30 BRT market close + 90min buffer)
}
```

### Pattern 2: Two-Table Price Lookup (CRITICAL integration seam)

The existing `assetPrices` table is per-org (manual entries). The new `globalAssetPrices` is global (automated). Reads must prefer global for market-quoted assets:

```typescript
// Modified getLatestPrices() in queries.ts — conceptual pattern
// For market_quoted assets: JOIN global_asset_prices ON ticker+MAX(price_date)
// For accrual_based assets: continue reading from asset_prices (manual rate entry)
// Fallback: if no global price found, fall back to asset_prices

async function getLatestPricesForOrg(orgId: string): Promise<Record<string, number>> {
  const db = getDb()

  // Fetch all assets with their pricing_type
  const orgAssets = await db
    .select({ id: assets.id, ticker: assets.ticker, pricingType: assets.pricingType })
    .from(assets)
    .where(eq(assets.orgId, orgId))

  const marketTickers = orgAssets
    .filter(a => a.pricingType === 'market_quoted')
    .map(a => a.ticker)

  // Batch-fetch latest global prices for market_quoted tickers
  const globalPrices = await db.execute<{ ticker: string; price_cents: number }>(
    sql`SELECT DISTINCT ON (ticker) ticker, price_cents
        FROM global_asset_prices
        WHERE ticker = ANY(${marketTickers})
        ORDER BY ticker, price_date DESC`
  )

  const globalByTicker: Record<string, number> = {}
  for (const row of globalPrices) {
    globalByTicker[row.ticker] = row.price_cents
  }

  // Build result: prefer global, fall back to per-org manual
  const result: Record<string, number> = {}
  for (const asset of orgAssets) {
    if (asset.pricingType === 'market_quoted' && globalByTicker[asset.ticker]) {
      result[asset.id] = globalByTicker[asset.ticker]
    }
    // accrual_based: handled separately via computeAccrualPrice()
  }

  // Fill in accrual_based and market_quoted fallbacks from asset_prices
  // ...

  return result
}
```

**Key point:** `getLatestPriceCents()` in `position-snapshots.ts` must be updated in parallel with `getLatestPrices()` in `queries.ts` — they both read the price source and must agree.

### Pattern 3: Snapshot Recomputation After Price Update

After the daily price cron upserts to `global_asset_prices`, snapshots for affected orgs must be recomputed. The recommended approach: the orchestrator in `update-daily.ts` triggers `recomputeOrgPositionSnapshots()` for each affected org.

```typescript
// lib/prices/update-daily.ts — orchestration flow
export async function runDailyPriceUpdate() {
  const db = getDb()

  // 1. Collect all unique market-quoted tickers across ALL orgs
  const marketAssets = await db
    .select({ ticker: assets.ticker, coingeckoId: assets.coingeckoId, assetClass: assets.assetClass })
    .from(assets)
    .where(eq(assets.pricingType, 'market_quoted'))
    // No orgId filter — global query

  // 2. Partition by source
  const b3Tickers = marketAssets.filter(a => a.assetClass !== 'crypto').map(a => a.ticker)
  const cryptoIds = marketAssets.filter(a => a.assetClass === 'crypto' && a.coingeckoId).map(a => a.coingeckoId!)

  // 3. Fetch prices (in parallel)
  const [b3Prices, cryptoPrices, indicators] = await Promise.all([
    fetchBrapiPrices(b3Tickers),
    fetchCoinGeckoPrices(cryptoIds, marketAssets),
    fetchBcbIndicators(),
  ])

  // 4. Upsert to global_asset_prices
  const allPrices = [...b3Prices, ...cryptoPrices]
  if (allPrices.length > 0) {
    await db.insert(globalAssetPrices).values(allPrices).onConflictDoUpdate({
      target: [globalAssetPrices.ticker, globalAssetPrices.priceDate],
      set: { priceCents: sql`EXCLUDED.price_cents`, source: sql`EXCLUDED.source`, updatedAt: new Date() },
    })
  }

  // 5. Store BCB indicators as synthetic tickers
  await upsertIndicators(db, indicators)

  // 6. Find affected orgs and recompute snapshots
  const affectedTickers = allPrices.map(p => p.ticker)
  const affectedOrgs = await db
    .selectDistinct({ orgId: assets.orgId })
    .from(assets)
    .where(inArray(assets.ticker, affectedTickers))

  for (const { orgId } of affectedOrgs) {
    await recomputeOrgPositionSnapshots(orgId)
  }

  // 7. Invalidate Next.js cache tags for affected orgs
  for (const { orgId } of affectedOrgs) {
    invalidateTag(pricesTag(orgId))
    invalidateTag(investmentsTag(orgId))
    invalidateTag(snapshotsTag(orgId))
  }
}
```

### Pattern 4: BCB Rate Storage — Dedicated `economic_indicators` Table

**Decision: Use a separate `economic_indicators` table. Do NOT store rates in `global_asset_prices`.**

Storing rates in `price_cents` (an integer column named "cents") would require a non-obvious encoding convention that every future developer must know. The semantic mismatch between market price and daily rate is confusing enough to warrant a dedicated table. This is a firm architectural decision, not a preference.

Add migration **00026_economic_indicators.sql**:

```sql
CREATE TABLE public.economic_indicators (
  indicator   text    NOT NULL,   -- 'CDI' | 'SELIC' | 'IPCA'
  ref_date    date    NOT NULL,
  rate_bps    integer NOT NULL,   -- rate in basis points * 10000
                                  -- e.g., CDI 0.054266%/day stored as 54266
  source      text    NOT NULL DEFAULT 'bcb',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (indicator, ref_date)
);

ALTER TABLE public.economic_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "economic_indicators: authenticated can read"
  ON public.economic_indicators FOR SELECT
  TO authenticated
  USING (true);
-- Service role bypasses RLS for INSERT/UPDATE
```

**Rate encoding:** `rate_bps = round(daily_rate_percent * 1_000_000)`. CDI at 0.054266%/day → 54266. This convention is documented in the DDL, not buried in application arithmetic.

**Latest rate query:**
```sql
SELECT DISTINCT ON (indicator) indicator, rate_bps, ref_date
FROM economic_indicators
WHERE indicator = 'CDI'
ORDER BY indicator, ref_date DESC
```

**Updated migration count for Phase 8:** 00024 (global_asset_prices), 00025 (assets pricing columns), 00026 (economic_indicators).

### Pattern 5: Fixed Income Accrual Valuation (PRICE-03)

For `accrual_based` assets (CDB, LCI, LCA, Tesouro Direto), current value is computed from:
1. Purchase price (from `portfolio_events` buy event → `priceCents`)
2. Rate (from stored CDI/SELIC rate + spread defined on the asset)
3. Days elapsed since purchase

`estimateAssetValue()` in `core-finance/asset-valuation.ts` uses calendar-day compounding (`daysElapsed / 365`). **This is wrong for CDI.** Brazilian CDI compounds over 252 business days per year, not 365 calendar days. Using `estimateAssetValue()` directly for CDI-linked products will produce systematically low valuations.

A new pure function `computeAccrualPrice()` must implement the correct 252-day convention:

```typescript
// packages/core-finance/src/accrual.ts
// CDI convention: compound over 252 business days, NOT 365 calendar days
// BCB daily rate: 0.054266% per day  
// Formula: FV = PV * (1 + dailyRate/100) ^ businessDays
// where businessDays = count of non-weekend days between purchaseDate and today
// (simplified: use calendar days * 252/365 as approximation, or exact business day count)

export function computeAccrualPrice(
  purchasePriceCents: number,
  dailyRateBps: number,      // from economic_indicators.rate_bps
  spread: number,            // 1.0 for 100% CDI, 0.9 for 90% CDI
  purchaseDate: Date,
  referenceDate: Date = new Date(),
): number {
  const dailyRate = (dailyRateBps / 1_000_000) * spread  // e.g., 54266 / 1_000_000 = 0.054266% / 100 = 0.00054266
  const msPerDay = 86_400_000
  const calendarDays = (referenceDate.getTime() - purchaseDate.getTime()) / msPerDay
  // Use 252/365 ratio to approximate business days from calendar days
  const businessDays = Math.round(calendarDays * 252 / 365)
  if (businessDays <= 0) return purchasePriceCents
  return Math.round(purchasePriceCents * Math.pow(1 + dailyRate / 100, businessDays))
}
```

**CRITICAL:** Do NOT use `estimateAssetValue()` for CDI-linked products. That function uses calendar-day compounding (daysElapsed / 365) which produces incorrect results for Brazilian fixed income. `computeAccrualPrice()` is a new function with the 252-day convention.

This pure function lives in `packages/core-finance/src/accrual.ts` and is testable with Vitest.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Float-to-cents conversion | `price * 100` | `Math.round(parseFloat(price.toFixed(2)) * 100)` | `38.45 * 100 = 3844.9999...` floating-point error |
| B3 price source | Manual entry UI | brapi.dev REST API | Covers all B3 instruments, FIIs, ETFs, BDRs |
| Cron scheduling | node-cron, bull, pg_cron | Netlify Scheduled Functions | Consistent with cfo-daily.mts; no new infra |
| HTTP client | axios, node-fetch | Native `fetch()` | Node.js 18+ includes fetch natively |
| Compound growth formula | Custom math | `estimateAssetValue()` in core-finance | Already built and tested |
| Snapshot recomputation | Custom loop | `recomputeOrgPositionSnapshots()` | Already built and tested |

---

## Common Pitfalls

### Pitfall 1: Fixed Income Treated as Market-Quoted
**What goes wrong:** CDB/LCI/LCA/Tesouro assets sent to brapi.dev; API returns null or error because tickers like "CDB001" aren't listed on B3.
**Why it happens:** All assets fetched without checking `assetClass` or `pricing_type`.
**How to avoid:** Filter `assets` by `pricing_type = 'market_quoted'` before calling brapi.dev/CoinGecko. Accrual-based assets get a computed price from the BCB CDI rate, not a market lookup.
**Warning signs:** `null` or missing entries in the brapi response for fixed income tickers.

### Pitfall 2: Float-to-Cents Precision Error
**What goes wrong:** `38.45 * 100` evaluates to `3844.9999...`, rounds to `3844` instead of `3845`.
**Why it happens:** IEEE 754 floating-point representation.
**How to avoid:** Always use `Math.round(parseFloat(price.toFixed(2)) * 100)` at the API boundary.
**Warning signs:** Prices off by 1 cent, especially for prices ending in `.45`, `.05`, `.95`.

### Pitfall 3: Thundering Herd on Price APIs
**What goes wrong:** For each org separately, the cron fetches all its tickers — 10 orgs × 50 tickers = 500 brapi calls instead of 50.
**Why it happens:** Loop over orgs before collecting unique tickers.
**How to avoid:** `SELECT DISTINCT ticker FROM assets WHERE pricing_type = 'market_quoted'` across ALL orgs first, then one batch API call per unique ticker set. `global_asset_prices` is global precisely for this reason.
**Warning signs:** API rate limit errors, brapi billing spikes.

### Pitfall 4: Wrong Migration Numbers
**What goes wrong:** Migrations named 00022/00023 conflict with existing `cfo_chat` and `simulation_scenarios` migrations — causes duplicate migration errors.
**Why it happens:** ARCHITECTURE.md was written before CFO/simulation migrations were added.
**How to avoid:** Next available numbers are **00024** and **00025**. Always check `supabase/migrations/` before naming a migration.

### Pitfall 5: Snapshots Not Recomputed After Price Update
**What goes wrong:** `global_asset_prices` is updated, but `asset_position_snapshots` still holds old prices, so portfolio page shows stale values.
**Why it happens:** Forgetting to call `recomputeOrgPositionSnapshots()` after price upsert.
**How to avoid:** The `update-daily.ts` orchestrator must call `recomputeOrgPositionSnapshots()` for every affected org and then invalidate the `pricesTag` and `investmentsTag` cache tags.
**Warning signs:** Investments page shows yesterday's prices after market close.

### Pitfall 6: actions.ts Already Over 500 Lines
**What goes wrong:** Adding price server actions to `actions.ts` pushes it further over the CLAUDE.md 500-line limit.
**Why it happens:** `actions.ts` is currently 585 lines — already violates the limit.
**How to avoid:** New price-related server actions (e.g., manual price override) go in `lib/prices/price-actions.ts`. Do not touch `actions.ts` in this phase.
**Warning signs:** CI typecheck or lint failing due to file size violations.

### Pitfall 7: coingecko_id Null for Crypto Assets
**What goes wrong:** Crypto assets exist in `assets` table with `assetClass = 'crypto'` but `coingecko_id IS NULL`. CoinGecko fetch skips them, leaving crypto positions with no updated price.
**Why it happens:** Migration adds column but no seed data; existing crypto assets have null `coingecko_id`.
**How to avoid:** Seed migration (00025) must include `UPDATE assets SET coingecko_id = ...` for the common tickers — or the orchestrator must handle null gracefully and log a warning. Decide: seed in migration or via asset edit UI.
**Warning signs:** Crypto positions always show last manually-entered price, never update.

### Pitfall 8: B3 Market Closed on Weekends/Holidays
**What goes wrong:** Cron fires on a Monday (or day after holiday), brapi returns last close price for previous trading day — this is correct behavior, but the price_date stored must be the price's effective date, not today's date.
**Why it happens:** Using `new Date()` as `price_date` when the market was closed.
**How to avoid:** Use `regularMarketTime` from the brapi response to determine the effective price date, not the cron execution date. This ensures the primary key `(ticker, price_date)` stores the actual trading date.

### Pitfall 9: CoinGecko Demo Rate Limit
**What goes wrong:** CoinGecko Demo tier allows 30 req/min. With large coingecko_id lists, a single call batching 250+ ids might exceed the response size limit or trigger rate limiting.
**Why it happens:** CoinGecko `simple/price` accepts comma-separated `ids` — no documented per-call limit, but very long URLs can fail.
**How to avoid:** Batch in chunks of 50 coingecko_ids per request. At one daily run, 50 cryptos × 1 call = well within 10k/month limit.

### Pitfall 10: Using Calendar-Day Compounding for CDI (Wrong Formula)
**What goes wrong:** Fixed income valuations drift progressively lower than actual balance. A CDB purchased at R$10,000 tracking 100% CDI shows R$11,200 after 2 years when the real value is R$11,380.
**Why it happens:** `estimateAssetValue()` uses `daysElapsed / 365` (calendar-day compounding). Brazilian CDI compounds over 252 business days per year. Using the wrong day-count convention understates accrual by ~(365/252 - 1) ≈ 45% of the excess return.
**How to avoid:** Use `computeAccrualPrice()` from `core-finance/accrual.ts` (new function in this phase) with the 252 business-day convention. Never call `estimateAssetValue()` for CDI/SELIC-linked products.
**Warning signs:** Fixed income positions show values slightly below what the bank/broker's statement shows.

---

## External API Reference

### brapi.dev — B3 Equities

```
GET https://brapi.dev/api/quote/{tickers}?token={TOKEN}
```

- `tickers`: Comma-separated B3 tickers (e.g., `PETR4,VALE3,BBAS3,MXRF11,BOVA11`)
- No documented per-call ticker limit; batch all unique tickers in one request
- `fundamental=false` skips financial statements — faster response
- Response: `{ results: [{ symbol, regularMarketPrice, regularMarketPreviousClose, regularMarketTime, currency }] }`
- `regularMarketPrice`: `number` — current/last close price in BRL
- `regularMarketTime`: ISO 8601 timestamp — use as `price_date`
- Free tier: 4 hardcoded tickers only. Startup plan required for production.
- Confidence: HIGH (verified brapi.dev/docs)

### CoinGecko — Crypto Prices

```
GET https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=brl
```

- `ids`: Comma-separated CoinGecko IDs (e.g., `bitcoin,ethereum,solana`)
- `vs_currencies=brl`: Returns prices in BRL
- Response: `{ "bitcoin": { "brl": 350000.12 }, "ethereum": { "brl": 18000.45 } }`
- BRL is a supported `vs_currency` (confirmed by CoinGecko docs)
- Demo tier: 30 req/min, 10k req/month. Batch ≤50 ids per request.
- API key: `x-cg-demo-api-key` header (optional on Demo tier but recommended)
- Confidence: HIGH (verified docs.coingecko.com)

### BCB Dados Abertos — Economic Indicators

```
GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series}/dados/ultimos/1?formato=json
```

| Indicator | Series | Unit |
|-----------|--------|------|
| CDI | 12 | % per day (e.g., `"0.054266"`) |
| SELIC | 11 | % per day (same format as CDI) |
| IPCA | 433 | % monthly (e.g., `"0.70"`) |

- Response: `[{ "data": "31/03/2026", "valor": "0.054266" }]`
- No authentication, no rate limit documented, free
- Date format `DD/MM/YYYY` must be parsed (not ISO 8601)
- Confidence: HIGH (live endpoint verified during research)

---

## Database Schema

### Migration 00024: `global_asset_prices`

```sql
-- supabase/migrations/00024_global_asset_prices.sql
CREATE TABLE public.global_asset_prices (
  ticker      text    NOT NULL,
  price_date  date    NOT NULL,
  price_cents integer NOT NULL,
  source      text    NOT NULL,   -- 'brapi' | 'coingecko' | 'bcb'
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, price_date)
);

-- No RLS on this table — service role writes, all authenticated reads
-- Pattern: disable RLS, grant SELECT to authenticated role
ALTER TABLE public.global_asset_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "global_asset_prices: authenticated can read"
  ON public.global_asset_prices FOR SELECT
  TO authenticated
  USING (true);

-- Service role bypasses RLS for writes (no INSERT policy needed)
```

**BCB indicators are stored in the separate `economic_indicators` table (migration 00026), NOT in `global_asset_prices`.** See Pattern 4 for the table definition and rate encoding convention.

### Migration 00025: `assets` Metadata Columns

```sql
-- supabase/migrations/00025_assets_pricing_metadata.sql
ALTER TABLE public.assets
  ADD COLUMN pricing_type text NOT NULL DEFAULT 'market_quoted',
  ADD COLUMN coingecko_id  text;

-- Using text + CHECK rather than pgEnum to match migration simplicity.
-- Note: The existing schema uses pgEnum for asset_class and event_type.
-- If consistency with existing enums is preferred, define a
-- CREATE TYPE pricing_type AS ENUM ('market_quoted', 'accrual_based')
-- and change the column type. Either approach is correct.
ALTER TABLE public.assets
  ADD CONSTRAINT assets_pricing_type_check
    CHECK (pricing_type IN ('market_quoted', 'accrual_based'));

-- Index for the cron: fast scan of all market_quoted assets across all orgs
CREATE INDEX idx_assets_pricing_type
  ON public.assets (pricing_type);
```

### Drizzle Schema Update (`packages/db/src/schema/investments.ts`)

Add `pricingType` and `coingeckoId` to `assets` table definition. Add `globalAssetPrices` table definition. Both must be exported from `packages/db/src/index.ts`.

---

## Code Examples

### brapi Client

```typescript
// lib/prices/brapi-client.ts
// Source: brapi.dev/docs

const BRAPI_TOKEN = process.env.BRAPI_TOKEN!
const BRAPI_BASE = 'https://brapi.dev/api'

export interface BrapiPrice {
  ticker: string
  priceCents: number
  priceDate: Date  // from regularMarketTime
}

export async function fetchBrapiPrices(tickers: string[]): Promise<BrapiPrice[]> {
  if (tickers.length === 0) return []

  const url = `${BRAPI_BASE}/quote/${tickers.join(',')}?token=${BRAPI_TOKEN}&fundamental=false`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`brapi.dev error: ${res.status} ${await res.text()}`)
  }

  const data = await res.json() as { results: Array<{
    symbol: string
    regularMarketPrice: number | null
    regularMarketTime: string
  }> }

  return data.results
    .filter(r => r.regularMarketPrice != null)
    .map(r => ({
      ticker: r.symbol,
      priceCents: Math.round(parseFloat(r.regularMarketPrice!.toFixed(2)) * 100),
      priceDate: new Date(r.regularMarketTime),
    }))
}
```

### CoinGecko Client

```typescript
// lib/prices/coingecko-client.ts
// Source: docs.coingecko.com/reference/simple-price

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY  // optional on Demo tier
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

export async function fetchCoinGeckoPrices(
  coinIds: string[],
  idToTicker: Record<string, string>  // coingecko_id → asset ticker
): Promise<Array<{ ticker: string; priceCents: number; priceDate: Date }>> {
  if (coinIds.length === 0) return []

  // Batch in chunks of 50 to stay within URL length limits
  const CHUNK = 50
  const results: Array<{ ticker: string; priceCents: number; priceDate: Date }> = []

  for (let i = 0; i < coinIds.length; i += CHUNK) {
    const chunk = coinIds.slice(i, i + CHUNK)
    const url = `${COINGECKO_BASE}/simple/price?ids=${chunk.join(',')}&vs_currencies=brl&include_last_updated_at=true`

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = COINGECKO_API_KEY

    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`)

    const data = await res.json() as Record<string, { brl: number; last_updated_at: number }>

    for (const [coinId, prices] of Object.entries(data)) {
      const ticker = idToTicker[coinId]
      if (!ticker || !prices.brl) continue
      results.push({
        ticker,
        priceCents: Math.round(parseFloat(prices.brl.toFixed(2)) * 100),
        priceDate: new Date(prices.last_updated_at * 1000),
      })
    }
  }

  return results
}
```

### BCB Client

```typescript
// lib/prices/bcb-client.ts
// Source: api.bcb.gov.br — series 12 (CDI), 11 (SELIC), 433 (IPCA)

const BCB_BASE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs'

async function fetchLatestRate(seriesId: number): Promise<{ data: string; valor: string }> {
  const res = await fetch(`${BCB_BASE}.${seriesId}/dados/ultimos/1?formato=json`)
  if (!res.ok) throw new Error(`BCB series ${seriesId} error: ${res.status}`)
  const [row] = await res.json() as Array<{ data: string; valor: string }>
  return row
}

export interface BcbIndicators {
  cdiDailyRateBps: number   // stored in global_asset_prices price_cents for ticker 'CDI'
  selicDailyRateBps: number // stored for ticker 'SELIC'
  ipcaMonthlyRateBps: number // stored for ticker 'IPCA'
  effectiveDate: Date
}

export async function fetchBcbIndicators(): Promise<BcbIndicators> {
  // Note: BCB date format is DD/MM/YYYY
  const [cdi, selic, ipca] = await Promise.all([
    fetchLatestRate(12),
    fetchLatestRate(11),
    fetchLatestRate(433),
  ])

  // Parse DD/MM/YYYY
  const [day, month, year] = cdi.data.split('/').map(Number)
  const effectiveDate = new Date(year, month - 1, day)

  return {
    cdiDailyRateBps: Math.round(parseFloat(cdi.valor) * 1_000_000),  // 0.054266 → 54266
    selicDailyRateBps: Math.round(parseFloat(selic.valor) * 1_000_000),
    ipcaMonthlyRateBps: Math.round(parseFloat(ipca.valor) * 1_000_000),  // 0.70 → 700000
    effectiveDate,
  }
}
```

### API Route (`/api/prices/update-daily/route.ts`)

```typescript
// apps/web/app/api/prices/update-daily/route.ts
import { NextResponse } from 'next/server'
import { runDailyPriceUpdate } from '@/lib/prices/update-daily'

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runDailyPriceUpdate()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[prices] Daily update failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Manual price entry per asset | Automated daily cron via brapi.dev + CoinGecko | Zero user action required for market prices |
| `asset_prices` table (per-org) | `global_asset_prices` (global) feeds snapshots; `asset_prices` remains for manual overrides | O(unique tickers) API calls, not O(orgs) |
| `estimateAssetValue()` with manual annual rate | CDI/SELIC from BCB API → computed annual rate → `estimateAssetValue()` | Fixed income valuations stay current automatically |

---

## Open Questions

1. **coingecko_id seed strategy**
   - What we know: Migration 00025 adds `coingecko_id text` to `assets`. Existing crypto assets have `assetClass = 'crypto'` but no `coingecko_id`. The cron skips null `coingecko_id`.
   - What's unclear: Should we seed the top 20 mappings in the migration, or add a UI field to the asset edit form?
   - Recommendation: Both. Add the top 20 seed mappings as a commented reference in the migration documentation, but populate via the asset edit form UI (one new text field on the existing edit page). The migration should NOT auto-update existing rows because ticker names alone don't unambiguously identify CoinGecko IDs.

2. **brapi.dev `regularMarketTime` on non-trading days**
   - What we know: The cron fires at 19:00 UTC weekdays. brapi returns the last available price even when queried after market close.
   - What's unclear: What `regularMarketTime` value does brapi return on a Monday after a Brazilian holiday? Does it correctly return Thursday's date?
   - Recommendation: Use `regularMarketTime` as `price_date`. This is correct behavior — if the market was closed Monday, the price stored is Friday's close with Friday's date. Verify this behavior manually with the Startup plan before shipping.

3. **`recomputeOrgPositionSnapshots` performance at scale**
   - What we know: Currently recomputes all snapshots for an entire org in one transaction. Fine for small portfolios.
   - What's unclear: If an org has 100 assets and prices update for 50 of them, recomputing all 100 is redundant work.
   - Recommendation: Not a concern for v2.0 scale. The current implementation is correct and already tested. Optimize only if performance becomes an issue.

---

## Environment Availability

Phase 8 has external API dependencies. Local dev does not need them to be available (mocking is acceptable for tests), but the Netlify deployment environment requires:

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| brapi.dev Startup plan token | PRICE-01 | Must purchase | Verify current price at brapi.dev/pricing; research found R$59.99/month |
| CoinGecko Demo API key | PRICE-02 | Free registration at coingecko.com/api | Optional but recommended for rate limit stability |
| BCB dados abertos API | PRICE-03 | Free, no auth, no registration | Live endpoint verified during research |
| Netlify env vars: `BRAPI_TOKEN`, `COINGECKO_API_KEY` | All price fetches | Must configure in Netlify dashboard | Same pattern as `SUPABASE_SERVICE_ROLE_KEY` |

**No missing dependencies that block implementation.** BCB is immediately available. brapi/CoinGecko require account registration before production deployment.

---

## Validation Architecture

`nyquist_validation: true` is set in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `packages/core-finance` — no config file; `vitest run` from package root |
| Quick run command | `pnpm --filter @floow/core-finance test` |
| Full suite command | `pnpm --filter @floow/core-finance test` (same — all tests run in ~2s) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| PRICE-01 | brapi price → correct cents conversion | unit | `pnpm --filter @floow/web test -- brapi` | ❌ Wave 0 |
| PRICE-01 | null price gracefully skipped | unit | `pnpm --filter @floow/web test -- brapi` | ❌ Wave 0 |
| PRICE-02 | coingecko response → correct cents in BRL | unit | `pnpm --filter @floow/web test -- coingecko` | ❌ Wave 0 |
| PRICE-02 | missing coingecko_id gracefully skipped | unit | `pnpm --filter @floow/web test -- coingecko` | ❌ Wave 0 |
| PRICE-03 | BCB rate parsed from DD/MM/YYYY format | unit | `pnpm --filter @floow/web test -- bcb` | ❌ Wave 0 |
| PRICE-03 | `computeAccrualPrice()` 252-day compound growth | unit | `pnpm --filter @floow/core-finance test -- accrual` | ❌ Wave 0 |
| PRICE-04 | portfolio page snapshot uses global price over manual | integration | manual smoke test via /investments | manual only |

**Note on test file locations:** The price clients live in `apps/web/lib/prices/`. Their transformation logic tests should live there too: `apps/web/lib/prices/__tests__/`. The `computeAccrualPrice()` function lives in `packages/core-finance/src/accrual.ts` and its test lives in `packages/core-finance/src/__tests__/accrual.test.ts`.

### Sampling Rate
- **Per task commit:** `pnpm --filter @floow/core-finance test`
- **Per wave merge:** `pnpm --filter @floow/core-finance test`
- **Phase gate:** Full suite green + manual smoke test on investments page before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/web/lib/prices/__tests__/brapi-client.test.ts` — covers PRICE-01 conversion logic
- [ ] `apps/web/lib/prices/__tests__/coingecko-client.test.ts` — covers PRICE-02 conversion logic
- [ ] `apps/web/lib/prices/__tests__/bcb-client.test.ts` — covers PRICE-03 rate parsing
- [ ] `packages/core-finance/src/__tests__/accrual.test.ts` — covers PRICE-03 `computeAccrualPrice()` 252-day convention

---

## Sources

### Primary (HIGH confidence)
- `apps/web/lib/investments/queries.ts` — existing `getLatestPrices()` implementation (direct codebase read)
- `apps/web/lib/investments/position-snapshots.ts` — existing snapshot recomputation (direct codebase read)
- `packages/core-finance/src/asset-valuation.ts` — existing `estimateAssetValue()` (direct codebase read)
- `netlify/functions/cfo-daily.mts` — canonical Netlify cron pattern (direct codebase read)
- `apps/web/app/api/cfo/run-daily/route.ts` — canonical internal API route auth pattern (direct codebase read)
- `supabase/migrations/` — migration numbering; confirmed 00023 is last (direct filesystem read)
- https://brapi.dev/docs — endpoint, fields, response structure confirmed
- https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/1?formato=json — live CDI response verified (`[{"data":"31/03/2026","valor":"0.054266"}]`)
- https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados/ultimos/1?formato=json — live SELIC response verified
- https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/1?formato=json — live IPCA response verified
- https://docs.coingecko.com/reference/simple-price — BRL support confirmed, response format verified

### Secondary (MEDIUM confidence)
- brapi.dev ticker batching: no documented max; examples show multiple tickers; recommend ≤100 per call as conservative limit
- CoinGecko Demo rate limits: 30 req/min, 10k/month confirmed from support docs

---

## Metadata

**Confidence breakdown:**
- API contracts (brapi, CoinGecko, BCB): HIGH — live endpoints verified during research
- Migration numbers: HIGH — filesystem confirmed 00023 is last
- Integration seam (queries.ts modification): HIGH — codebase read confirms current implementation
- Netlify cron pattern: HIGH — cfo-daily.mts is canonical and confirmed
- CoinGecko BRL support: HIGH — confirmed in docs
- BCB rate precision convention: MEDIUM — convention chosen; future devs must follow it

**Research date:** 2026-03-31
**Valid until:** 2026-06-30 (BCB/CoinGecko APIs are stable; brapi.dev pricing may change)
