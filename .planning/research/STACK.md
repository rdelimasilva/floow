# Technology Stack

**Project:** Floow v2.0 — Open Finance & Asset Price Automation
**Researched:** 2026-03-29
**Overall confidence:** HIGH (providers), MEDIUM (pluggy-sdk exact version — verify at install)

---

## Context: What Already Exists (Do Not Re-Research)

Validated, unchanging stack: Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, React Hook Form, Zod, TanStack Query, Recharts, Drizzle ORM, Supabase (PostgreSQL, Auth, RLS, Vault), Stripe, Netlify, pnpm + Turborepo, `core-finance` pure functions package, `date-fns@^4.1.0`, category_rules engine (v1.1).

This file covers only additions required for v2.0 features:
- Open Finance bank connection (import automático de extratos)
- Automatic asset price updates (B3, crypto)
- Auto-reconciliation of imported transactions
- Auto-categorization applied to imported statements

---

## Open Finance Provider Recommendation

**Recommended: Pluggy**

Use Pluggy over Belvo for this project. Rationale below.

### Provider Comparison

| Criterion | Pluggy | Belvo |
|-----------|--------|-------|
| Market focus | Brazil-first | LATAM (Mexico, Brazil, Colombia) |
| Brazilian bank coverage | 70+ institutions via regulated Open Finance connectors; all major banks (Itaú, Bradesco, Santander, BB, Nubank, Inter, XP, BTG) | Broader LATAM; Brazil covered but not primary focus |
| Regulatory status | BACEN-authorized ITP (Payment Transaction Initiator) since June 2024; CNPJ 37.943.755/0001-30 | Brazil covered via Open Finance; LATAM-distributed attention |
| Pricing entry point | R$2,500/month (Basic plan, production); 14-day free trial for development | ~$1,000/month (Launch tier) ≈ R$5,000+ at current exchange |
| Free trial | 14 days, no credit card, full API access, up to 20 accounts | Up to 25 live data links |
| Webhook support | YES — full event model: `item/created`, `item/updated`, `transactions/created`, `transactions/updated`, `transactions/deleted`. Up to 9 retry attempts. HTTPS-only; custom headers supported | YES |
| Node.js SDK | `pluggy-sdk` on npm — TypeScript typings built-in | Python, Node.js, Ruby SDKs |
| Auto-sync frequency | Every 24h (Basic), 12h, or 8h (higher tiers) — webhook-driven | Comparable |
| API response time | 150–300ms average | 200–400ms average |
| Investments data | Accounts, transactions, investments, brokerage notes, identity | Comparable |
| Documentation | Developer-first, Portuguese + English, comprehensive webhook docs | Good English docs |

**Why Pluggy wins for Floow:**
1. Brazil-only focus maps to the product's audience (investidores BR)
2. 70+ Brazilian institutions via regulated Open Finance (BACEN-authorized) — covers virtually every user's bank
3. `pluggy-sdk` is Node.js/TypeScript native — integrates cleanly with existing Netlify Functions pattern
4. R$2,500/month vs Belvo's ~R$5,000/month equivalent — significantly cheaper for a BR-only product
5. Investment account data (XP, BTG, brokerage notes) aligns with Floow's investment portfolio features

**Business constraint:** R$2,500/month is a fixed cost from day one in production — before any paying users. The 14-day free trial is for development only and does not apply to production. Factor this into go-live pricing decisions.

**Choose Belvo only if:** Floow expands to Mexico or Colombia before Open Finance in Brazil proves out.

---

## New Stack Additions

### Open Finance SDK

| Technology | Version | Purpose | Integration Point |
|------------|---------|---------|-------------------|
| `pluggy-sdk` | latest (verify at install — `^0.74.0` per search snippet; confirm on npm) | Server-side Pluggy API calls: create connect tokens, fetch items/accounts/transactions, manage webhooks | `netlify/functions/` only (Node.js) |
| `pluggy-connect-sdk` | latest | Client-side Pluggy Connect Widget initialization | `apps/web` — browser only, submodule import to avoid SSR bundling |

**Runtime constraint:** `pluggy-sdk` is Node.js-only. It cannot run in Supabase Edge Functions (Deno). All Pluggy API calls must go through Netlify Functions. Pluggy also exposes a plain REST API — if you want to avoid the SDK, `fetch()` calls work from any runtime, but the SDK provides TypeScript typings and handles credential management.

### Asset Price APIs

| Technology | Purpose | Plan | Cost | Rate Limit |
|------------|---------|------|------|------------|
| **brapi.dev** | B3 stocks, FIIs, ETFs, BDRs — all Brazilian equities | Startup plan | R$59.99/month | 150k req/month; ~15min data delay |
| **CoinGecko API** | Crypto prices (BTC, ETH, and all coins users hold) | Demo (free) to start; Basic if needed | Free (10k/month, 30/min) → $35/month (100k/month) | 30 req/min free |

**brapi.dev** covers all Brazilian B3 instruments in one REST API (`GET /api/quote/{tickers}`) with bearer token auth, historical data, fundamentals, and dividends. The Startup plan (R$59.99/month) gives 150k requests/month with ~15-minute delay — more than sufficient for a scheduled price sync.

**Key design:** The scheduled price sync must collect all unique tickers across all orgs first, then batch-fetch each ticker once. Not per-user calls. This keeps API usage O(unique tickers), not O(users), and stays well within rate limits even at scale.

**CoinGecko Demo** (free) is sufficient for launch: 10k calls/month, 30/min. At one update per hour per unique crypto ticker, free tier supports ~13 distinct crypto symbols updating continuously. Upgrade to Basic ($35/month = 100k calls) when users exceed ~130 active crypto positions across the platform. No library needed — plain `fetch()` to `https://api.coingecko.com/api/v3/`.

**International stocks (USD):** Not in v2.0 scope per PROJECT.md. When multi-currency ships, add `yahoo-finance2` or Alpha Vantage.

### No New Libraries for Reconciliation and Categorization

| Capability | Implementation | Why |
|------------|----------------|-----|
| Transaction reconciliation algorithm | Pure function in `core-finance` | Fits established pattern; zero new deps; fully testable with Vitest |
| Description fuzzy matching | `fastest-levenshtein@^1.0.16` (300-byte, zero-dep, npm) | Single function needed for Levenshtein distance; no full library |
| Auto-categorization on import | Call existing `applyCategorizationRules()` from v1.1 | Already built and tested — zero new code needed |

**Reconciliation logic:** Match imported transaction to existing by `(amount_cents exact) AND (date within ±3 days) AND (description similarity > 0.7)`. Amount+date filtering reduces the candidate set to near-zero in most cases; description similarity is a tiebreaker. `fastest-levenshtein` provides the distance function in ~300 bytes with no transitive dependencies.

**Do not add Fuse.js or similar.** Full fuzzy-search libraries are overkill for a 1–5 candidate comparison.

---

## Scheduling Architecture

Two scheduled jobs in v2.0:

| Job | Frequency | Execution time | What it does |
|-----|-----------|----------------|-------------|
| `sync-prices` | Every 15–60 min (market hours) | Under 30 seconds | Fetch latest prices for all unique tickers, update `asset_prices` table |
| `pluggy-daily-sync` | Daily at 05:00 BRT fallback + webhook-triggered | Under 30 seconds (or 15 min if long-running) | Drain `pluggy_webhook_events` queue; process transactions |

### Use Netlify Scheduled Functions (same pattern as existing `cfo-daily.mts`)

The existing `cfo-daily.mts` establishes the pattern: in-code `Config` export with `schedule`, no `netlify.toml` blocks required.

```typescript
// netlify/functions/sync-prices.mts
import type { Config } from '@netlify/functions'

export default async () => {
  // 1. Fetch all unique tickers across all orgs from DB (service-role)
  // 2. Batch-call brapi.dev for BR equities
  // 3. Batch-call CoinGecko for crypto
  // 4. Upsert asset_prices table (Math.round(parseFloat(price.toFixed(2)) * 100) for cents)
  return new Response('OK', { status: 200 })
}

export const config: Config = {
  schedule: '*/15 13-21 * * 1-5',  // every 15min, Mon–Fri, 13:00–21:00 UTC (10:00–18:00 BRT)
}
```

**Netlify scheduled functions have a 30-second execution limit.** This is sufficient for price sync (HTTP calls to brapi.dev + CoinGecko, then a DB upsert). If the daily Pluggy sync ever exceeds 30 seconds (large transaction volume), follow the existing `cfo-daily.mts` pattern: the scheduled function calls an internal Next.js API route (e.g., `/api/open-finance/run-sync`) which processes asynchronously. Do not try to attach a `schedule` to a background function — they are separate Netlify primitives.

---

## Webhook Architecture

Pluggy pushes `transactions/created` and `item/updated` events to a webhook URL. Server Actions cannot receive external webhooks (no stable inbound URL, CSRF protection). **The webhook endpoint must be a Netlify Function.**

```
netlify/functions/pluggy-webhook.mts   ← receives Pluggy events
```

Flow:
1. Pluggy POSTs to `https://app.floow.com/.netlify/functions/pluggy-webhook`
2. Function validates custom `Authorization` header (Bearer token stored as Netlify env var)
3. Function writes raw event payload to `pluggy_webhook_events` table in Supabase (service-role key)
4. Returns `202 Accepted` immediately
5. Daily scheduled function (or triggered async via internal API route) drains the queue and processes transactions

**Why enqueue instead of processing inline:** Pluggy requires a 2xx response within 5 seconds or it retries (up to 9 attempts). Reconciliation + categorization inline risks timeout. Enqueue + return 202 is the safe pattern.

**Service-role key:** Webhook handler has no user session. It uses `SUPABASE_SERVICE_ROLE_KEY` from Netlify env vars to write to the queue table. The queue table has RLS disabled for the service-role write path; the processing step re-applies org-scoped RLS when writing final transactions.

---

## Token and Credential Storage

| Secret | Where Stored | How Accessed |
|--------|-------------|-------------|
| Pluggy `clientId` + `clientSecret` | Netlify env vars | `process.env` in Netlify Functions |
| brapi.dev API token | Netlify env vars | `process.env` in Netlify Functions |
| CoinGecko API key | Netlify env vars (optional — Demo tier needs no key) | `process.env` in Netlify Functions |
| Pluggy `itemId` (per-user bank connection) | Supabase `pluggy_items` table | Fetched via service-role in scheduled function; never exposed client-side |
| Supabase service-role key | Netlify env vars (already set) | `process.env.SUPABASE_SERVICE_ROLE_KEY` |

**Pluggy access tokens:** Pluggy manages credentials in its own vault. The application stores only the `itemId` (opaque reference). The `item.status` field signals when re-authentication is needed (e.g., bank password changed). On `item/error` webhook event, surface a reconnect UI to the user.

---

## Pluggy Integration Flow

```
Browser                    Next.js (Server Action)     Netlify Function          Pluggy API
  |                               |                           |                       |
  |-- Connect bank button ------->|                           |                       |
  |                               |-- POST /.netlify/functions/pluggy-create-token -->|
  |                               |                           |-- createConnectToken->|
  |                               |                           |<-- { token } ---------|
  |                               |<-- { connectToken } ------|                       |
  |<-- render Pluggy Widget ------|                           |                       |
  |-- user selects bank + auth ---------------------------------------->|            |
  |                               |                           |<-- webhook item/created|
  |                               |                           |-- enqueue to DB        |
  |                               |                           |-- 202 OK ------------>|
```

The Pluggy Widget (`pluggy-connect-sdk`, browser) handles bank OAuth/credential flow entirely inside Pluggy's infrastructure. Floow never sees bank credentials.

---

## New Schema Tables Required

| Table | Purpose | Notes |
|-------|---------|-------|
| `pluggy_items` | One row per bank connection per org. Stores Pluggy `itemId`, `connectorId`, institution name, status, `lastSyncAt` | `itemId` is the external key; Pluggy never exposes credentials so no encryption needed |
| `asset_prices` | Latest price per ticker. One row per `ticker` (global or per-org — evaluate upsert strategy). `priceCents INTEGER` | Existing `assets` table may have `currentPriceCents` — consolidate or upsert here |
| `price_history` | Optional append-only price snapshots for charting | Defer to v2.1 unless PnL charts already need it |
| `pluggy_webhook_events` | Raw inbound webhook payloads queue, with `status: pending / processed / failed` | RLS bypassed by service-role writes; drained by scheduled function |

---

## Integer Cents at Price API Boundary

brapi.dev and CoinGecko return decimal float prices (e.g., `"regularMarketPrice": 38.45`). Convert to integer cents at the ingestion boundary using the safe pattern — never `price * 100` directly (floating-point error):

```typescript
// Safe: avoids 38.45 * 100 = 3844.9999...
function toCents(price: number): number {
  return Math.round(parseFloat(price.toFixed(2)) * 100)
}
```

Apply `toCents()` in the Netlify function before any DB write. Never store floats.

---

## Installation

```bash
# In web app (client-side Pluggy widget — browser only)
pnpm --filter @floow/web add pluggy-connect-sdk

# In netlify/functions (Node.js runtime — server-side Pluggy operations)
# Add to root or netlify/functions package.json depending on monorepo setup
pnpm add pluggy-sdk

# Optionally: if reconciliation needs string distance function
pnpm --filter @floow/core-finance add fastest-levenshtein@^1.0.16
```

No other new packages. brapi.dev and CoinGecko are plain REST APIs — native `fetch()` only.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Open Finance provider | Pluggy | Belvo | Pluggy is Brazil-first with BACEN ITP authorization; R$2,500/month vs ~R$5,000/month Belvo equivalent; TypeScript-native SDK |
| Open Finance provider | Pluggy | Direct BACEN Open Finance API | Requires BACEN authorization (months of compliance), bank-by-bank implementations — not viable for a startup |
| B3 price API | brapi.dev | Official B3 API | Official B3 API requires formal institutional agreement and is expensive; brapi.dev is the standard developer choice for BR fintech |
| B3 price API | brapi.dev | StatusInvest scraping | Web scraping is fragile; ToS violation risk |
| Crypto price API | CoinGecko | CoinMarketCap | CoinGecko free tier (10k/month) is more generous; better developer reputation |
| Reconciliation | Custom pure function in `core-finance` | External reconciliation library | No such library exists for the BR market; reconciliation logic is ~60 lines TypeScript |
| Webhook processing | Netlify Function + queue table | Supabase Edge Function | Pluggy SDK is Node.js-only; all Pluggy operations must be in Netlify Functions; consistent to handle webhooks there too |
| Scheduled price sync | Netlify Scheduled Function | Supabase pg_cron | pg_cron would call a Netlify Function (which calls brapi.dev) — unnecessary double-hop; Netlify Scheduled Function is the direct path consistent with existing `cfo-daily.mts` pattern |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `axios` | Redundant — `fetch()` is native in Node.js 18+ | Native `fetch()` |
| Fuse.js or any fuzzy-search library | Reconciliation only needs Levenshtein distance on a 1–5 candidate pre-filtered set | `fastest-levenshtein` (300 bytes) or inline |
| OpenAI / LLM for categorization | Already solved by rule-based engine in v1.1; adds cost, latency, privacy exposure of financial data | Existing `applyCategorizationRules()` |
| Real-time WebSocket price feeds | B3 closes 17:00 BRT; polling every 15 min is architecturally simpler and sufficient for a portfolio tracker | Scheduled cron with brapi.dev polling |
| `bull` / `bullmq` / Redis queue | Over-engineering; the webhook queue is a simple Postgres table with a status column | `pluggy_webhook_events` table + cron drain |
| `node-schedule` or `cron` npm | Requires persistent process; incompatible with serverless | Netlify Scheduled Functions (in-code `Config.schedule`) |
| Background function with `schedule` | Netlify scheduled functions and background functions are separate primitives — cannot combine `schedule` config with background function naming | Regular scheduled function; call internal API route for long-running work |

---

## Runtime Compatibility Matrix

| Technology | Netlify Function (Node 20) | Supabase Edge Function (Deno) | Next.js Server Action |
|------------|---------------------------|-------------------------------|----------------------|
| `pluggy-sdk` | YES | NO (Node.js only) | NO — use Netlify Function |
| `pluggy-connect-sdk` | N/A (browser only) | N/A | N/A |
| `fetch()` to brapi.dev | YES | YES | YES |
| `fetch()` to CoinGecko | YES | YES | YES |
| `fastest-levenshtein` | YES | YES (npm: specifier in Deno 2) | YES |
| `drizzle-orm` (via db package) | YES | PARTIAL (Node adapter) | YES |

**Key rule:** Any code touching `pluggy-sdk` lives in `netlify/functions/`. Price fetch code can live anywhere — put it in Netlify functions for consistency with the existing scheduled function pattern.

---

## Sources

- Pluggy pricing — https://www.pluggy.ai/pricing — MEDIUM confidence (R$2,500 Basic confirmed; enterprise custom pricing)
- Pluggy developer docs — https://docs.pluggy.ai — HIGH confidence (official)
- Pluggy webhook docs — https://docs.pluggy.ai/docs/webhooks — HIGH confidence (event types, retry policy, 5-second window verified)
- Pluggy Open Finance connectors — https://docs.pluggy.ai/docs/open-finance-regulated — HIGH confidence (70+ institutions, major banks list confirmed)
- Pluggy BACEN ITP authorization — https://www.pluggy.ai/open-finance + Finsiders Brasil article — HIGH confidence (June 2024 confirmed)
- `pluggy-sdk` npm — https://www.npmjs.com/package/pluggy-sdk — MEDIUM confidence (version cited from search snippet; npm page returned 403; verify at install)
- Belvo pricing — https://belvo.com/plans-and-pricing/ — HIGH confidence ($1,000/month Launch tier verified)
- brapi.dev pricing — https://brapi.dev/pricing — HIGH confidence (R$0/R$59.99/R$99.99 tiers verified)
- brapi.dev API docs — https://brapi.dev/docs/acoes — HIGH confidence (endpoints, asset types, bearer auth confirmed)
- CoinGecko API pricing — https://www.coingecko.com/en/api/pricing — HIGH confidence (10k/month Demo free, $35/month Basic confirmed)
- Netlify Scheduled Functions docs — https://docs.netlify.com/build/functions/scheduled-functions/ — HIGH confidence (30-second limit confirmed)
- Netlify Background Functions docs — https://docs.netlify.com/build/functions/background-functions/ — HIGH confidence (15-minute limit; HTTP-triggered, not schedule-triggered)
- Provider comparison (index.dev) — https://www.index.dev/skill-vs-skill/api-integration-plaid-vs-belvo-vs-pluggy-latam — MEDIUM confidence (third-party; cross-referenced with official sources)

---

*Stack research for: Floow v2.0 — Open Finance & Asset Price Automation*
*Researched: 2026-03-29*
