# Domain Pitfalls: Open Finance Integration, Auto-Pricing, Auto-Reconciliation

**Domain:** Adding automated data ingestion to an existing manual-first personal finance SaaS
**Researched:** 2026-03-29
**Confidence:** HIGH for structural/architectural pitfalls (verified via aggregator docs + established patterns); MEDIUM for Brazilian-specific rate limits (official docs had rendering issues, confirmed via secondary sources)

> **Note:** This file covers v2.0 milestone pitfalls only (Open Finance, auto-pricing, reconciliation,
> auto-categorization of imported statements). The v1.1 pitfalls (categorization rules engine,
> recurring transactions) were documented in the prior milestone and remain valid. The category_id IS NULL
> guard and service-role RLS patterns from v1.1 are referenced where they interact with v2.0 features.
> The v2.0 pitfalls in this file are fully self-contained and additive.

---

## Critical Pitfalls

### Pitfall 1: Duplicate transactions from OFX/manual overlap when Open Finance is connected

**What goes wrong:**
A user has been manually importing OFX/CSV extracts for 6 months. They connect Open Finance. The aggregator backfills up to 12 months of history. All transactions in the overlap window now exist twice — once from manual import (with a FITID-based ID) and once from the Open Finance API (with a provider-generated hash ID). There is no cross-reference between the two ID schemes. The dedup guard in `importSelectedTransactions` (which uses `onConflictDoUpdate` with `uniqueIndex` per `orgId`) was built for OFX/OFX conflicts, not OFX/API conflicts.

**Why it happens:**
OFX FITIDs are institution-issued sequential integers. Pluggy and Belvo generate their own hash from `(date, amount, description)`. There is no shared key. The same real-world transaction has two different IDs in the database.

**Consequences:**
- Account balances doubled in the overlap window
- Cash flow charts show inflated income and expense
- User loses trust immediately; this is a show-stopper

**Prevention:**
1. During the Open Finance connection wizard, ask the user to specify the "connection start date" and only accept transactions after that date — never backfill into territory already covered by manual imports
2. Build a pre-import dedup check: before inserting API-sourced transactions, query existing transactions in a `(account_id, date ± 1 day, amount_cents)` window and present conflicts to the user (reuse the existing reconciliation preview UI)
3. Do not make the first sync silent — always show a "review before importing" preview for the initial connection sync, regardless of `auto_categorize` settings

**Detection:**
- `SELECT date, amount_cents, COUNT(*) FROM transactions WHERE account_id = $x GROUP BY date, amount_cents HAVING COUNT(*) > 1` — run as a post-import health check
- Account balance does not match the bank's own balance shown in the aggregator

**Phase to address:** Open Finance Connection phase — the dedup strategy must be designed before any API sync writes to the database.

---

### Pitfall 2: Pluggy transaction IDs change when bank data is amended

**What goes wrong:**
Pluggy creates transaction IDs as a hash derived from `(date, description, amount)`. If the bank retroactively amends a transaction — common for credit card adjustments, boleto fee splits, or PIX reversals — Pluggy deletes the old ID and creates a new one. The application, which stored the Pluggy ID as a stable FK, now has an orphaned transaction and a ghost duplicate on the next sync.

**Why it happens:**
Pluggy explicitly documents this behavior: "if the date, description, or amount changes substantially, we will delete the existing transaction and create a new one." Developers assume bank-assigned IDs are stable; they are not.

**Consequences:**
- Silent duplicate appearing alongside the original
- Orphaned transactions with no matching aggregator record
- Reconciliation state corrupted

**Prevention:**
1. Store both `pluggy_id` (external, may change) and an internal `id` (UUID, immutable)
2. Process Pluggy webhooks: `transactions/created`, `transactions/updated`, `transactions/deleted` — handle the delete+recreate cycle explicitly
3. On `transactions/deleted` webhook: mark the transaction as `source_deleted = true` rather than hard-deleting it; alert the user for review
4. Add a `pluggy_id` column with a nullable unique index — nullable because not all transactions come from Pluggy

**Detection:**
- Webhook `transactions/deleted` events not being processed (check webhook logs)
- `pluggy_id` column is missing from the `transactions` schema

**Phase to address:** Open Finance Connection phase — webhook handling must be built before relying on Pluggy IDs as stable references.

---

### Pitfall 3: PIX transactions on the same day with identical amounts produce false reconciliation matches

**What goes wrong:**
In Brazil, it is extremely common to make multiple PIX transfers of the same amount in one day — monthly rent split among flatmates, marketplace payouts, payroll for small teams. The reconciliation engine matches by `(date, amount_cents, account_id)`. Two R$500 PIX credits on the same day match a single manually-entered R$500 transaction and one of the API-sourced transactions goes unmatched, while the other creates a phantom match.

**Why it happens:**
PIX transaction descriptions are free-form user text, unreliable as a matching key. The existing manual reconciliation preview was designed for OFX imports where FITIDs disambiguate. API-sourced transactions have no FITID equivalent.

**Consequences:**
- One real transaction is reconciled (correctly)
- A second identical transaction is either silently inserted (duplicate) or skipped (data gap)
- User's account balance is wrong by exactly R$500.00 — hard to notice

**Prevention:**
1. Use a 3-tier matching hierarchy: (a) `providerCode` exact match → HIGH confidence, (b) `(date, amount_cents)` → MEDIUM confidence / show for review, (c) anything else → no auto-match
2. For MEDIUM confidence matches where multiple candidates exist, always show the user a selection UI — never auto-pick when ambiguous
3. Store `provider_transaction_id` (the bank's own code, available via `providerCode` field in Pluggy) as a separate column — this is more stable than Pluggy's hash ID for dedup purposes

**Detection:**
- Two rows with the same `(account_id, date, amount_cents)` and different `source` values (`'manual'` vs `'pluggy'`)
- Account balance differs from bank balance by a multiple of a common PIX amount

**Phase to address:** Reconciliation phase — the matching algorithm must treat amount+date as ambiguous by default, not as a reliable match.

---

### Pitfall 4: Open Finance consent is silently revoked by the user in the bank app

**What goes wrong:**
A user revokes consent directly from their bank's app (Itaú, Bradesco, Nubank all have "Connected Apps" settings). Pluggy/Belvo sends a webhook. The application does not handle the webhook. From the user's perspective in Floow, the account still shows as "connected" and the last-sync date becomes stale. No new transactions import. The user may not notice for weeks.

**Why it happens:**
Consent revocation happens outside the application's UI — in the bank's own app. Without webhook handling, the application has no way to know. A stale connection icon with no error is easy to overlook.

**Consequences:**
- Weeks of missing transactions with no user alert
- User audits their portfolio and finds unexplained balance discrepancies
- Trust erosion: "the app shows connected but has no data"

**Prevention:**
1. Handle Pluggy's `item/error` and consent revocation webhooks — update `connections.status` to `NEEDS_RECONNECT` immediately
2. Show a prominent banner on the dashboard when any connected account has `status = NEEDS_RECONNECT` — do not bury it in settings
3. Implement a daily staleness check: if `last_sync_at < NOW() - INTERVAL '48 hours'` and `status = CONNECTED`, probe the connection and update status
4. Send an email notification (via Resend) when a connection is broken — "Your Banco do Brasil connection needs renewal"
5. Default consents have no expiry under current BCB rules (changed from 12 months in Oct 2023), but individual banks (e.g., Inter PJ) may enforce annual expiry — never assume no-expiry universally

**Detection:**
- `connections` rows where `last_sync_at < NOW() - INTERVAL '3 days'` and `status = 'connected'`
- No `item/error` webhook handler in the application

**Phase to address:** Open Finance Connection phase — connection health monitoring and stale detection are table stakes, not post-MVP.

---

### Pitfall 5: Monthly BCB operational limit per CPF blocks sync for active users

**What goes wrong:**
Brazil's Open Finance Network (BCB) enforces a per-CPF monthly limit on API calls. Once the limit is reached, no data can be retrieved for that CPF until the next calendar month. An aggressive sync schedule (e.g., hourly for every user) exhausts the limit mid-month, blocking the user from accessing their own data via Open Finance for the rest of the month.

**Why it happens:**
The limit is shared across all applications using the same Open Finance certificate. A multi-tenant SaaS that syncs all users on the same schedule can exhaust limits for individual CPFs faster than expected. The limit is not per-application but per-CPF across all applications.

**Consequences:**
- `400 operational_limits_reached` error from the aggregator for the rest of the month
- User cannot refresh their account data
- Customer support burden

**Prevention:**
1. Use exponential backoff for sync frequency: default to daily syncs, not hourly
2. Never trigger a full-sync on every page load or dashboard open — cache results and poll on a schedule
3. Implement adaptive sync: sync more frequently (4x/day) for accounts with recent activity, less frequently (1x/day) for dormant accounts
4. Expose manual "sync now" as a rate-limited user action (max 3 manual syncs per day per account)
5. Monitor `operational_limits_reached` errors per account and backoff gracefully with a user-visible message

**Detection:**
- `400` responses from aggregator API with `operational_limits_reached` error code
- Sync job running more than once per 6 hours per user account

**Phase to address:** Open Finance Connection phase — sync schedule design must account for this constraint from day one.

---

### Pitfall 6: Supabase pg_cron price update job becomes a thundering herd

**What goes wrong:**
The nightly asset price update job fetches quotes for all assets across all users in a single Edge Function call. With 100 users each holding 20 assets, that is 2,000 API calls to brapi.dev in one burst. The free tier allows 15,000 requests/month total. Daily bursts of 2,000 exhaust this in 7 days. The Startup plan (R$59.99/month, 150,000 req/month) is exhausted in 5 days at 500 users each with 10 assets.

**Why it happens:**
Naive implementation: "update all prices for all assets once daily." No batching, no dedup of shared assets (PETR4 held by 1,000 users should be fetched once, not 1,000 times).

**Consequences:**
- Price API quota exhausted mid-month
- All portfolio values stale for all users
- Unexpected API billing if on a pay-per-use plan

**Prevention:**
1. Maintain a global `asset_prices` table with a single row per ticker — never fetch per-user
2. Fetch each unique ticker once per update cycle regardless of how many users hold it
3. With 500 users sharing 200 unique tickers (B3 stocks), one update cycle = 200 API calls, not 10,000
4. For CoinGecko (crypto), batch multiple coins per request using the `/simple/price?ids=bitcoin,ethereum` endpoint — one request can fetch 250 coins
5. Schedule price updates for market close (after 18:00 BRL) — prices do not change outside trading hours; intraday updates waste quota
6. Cache the last-fetched price with a TTL; if a user requests a price within the TTL window, serve from cache without an API call

**brapi.dev rate limits (verified 2026-03):**
- Free: 15,000 req/month, ~30min delay
- Startup (R$59.99/mo): 150,000 req/month, ~15min delay
- Pro (R$99.99/mo): 500,000 req/month, ~5min delay
- All paid plans: max 10-20 tickers per request

**Detection:**
- Price update job logs show one API call per user×asset rather than one call per unique ticker
- `asset_prices` table has multiple rows per ticker (one per user) instead of one

**Phase to address:** Auto-pricing phase — the global `asset_prices` table architecture is a prerequisite, not a refactor.

---

### Pitfall 7: Renda fixa assets silently show stale or impossible prices

**What goes wrong:**
CDB, LCI, LCA, Tesouro Direto, and other fixed-income instruments do not have market-quoted prices the same way stocks do. Their value accrues daily based on CDI rate, IPCA index, or a fixed rate. Calling brapi.dev for a CDB ticker returns either an error, a book value (not market value), or a stale par value from the last audit. The Investments Engine shows a flat or wrong PnL for renda fixa positions.

**Why it happens:**
Developers treat all assets as market-priced. Renda fixa is fundamentally different: the "price" must be computed from the instrument's terms (rate, issuance date, maturity, index). No third-party API provides this without the specific instrument data.

**Consequences:**
- PnL for renda fixa positions is wrong
- Total patrimônio is understated (renda fixa typically 40-60% of a Brazilian investor's portfolio)
- User's net worth chart is meaningless

**Prevention:**
1. Classify assets with a `pricing_type` enum: `market_quoted` (ações, FIIs, ETFs, cripto) vs `accrual_based` (CDB, LCI, LCA, Tesouro Direto, debentures)
2. For `accrual_based` assets, store the instrument terms at registration: rate, rate type (% CDI, IPCA+, pre-fixado), issuance date, maturity date, face value
3. Compute current value in `core-finance` using a `computeAccrualPrice(terms, currentDate, currentCDI)` pure function — this is deterministic and testable
4. Fetch CDI rate (from BCB API, free, rarely changes) separately and store it in a `economic_indicators` table updated daily
5. Never call brapi.dev for renda fixa tickers — classify them as `accrual_based` and route to the computation path

**Detection:**
- Renda fixa positions showing flat PnL over time (no daily accrual)
- `asset_prices` table has rows for CDB/LCI/LCA tickers

**Phase to address:** Auto-pricing phase — the `pricing_type` classification must be in the schema before price updates are implemented.

---

### Pitfall 8: Float-to-integer-cents conversion on price API responses causes systematic PnL errors

**What goes wrong:**
brapi.dev returns prices as floats (e.g., `"regularMarketPrice": 28.47`). The codebase uses integer cents for all values. Naive conversion: `Math.round(28.47 * 100)` = `2847` (correct). But `28.4699999999...` (a common float representation) = `Math.round(2846.99...)` = `2846` — off by one cent per share. For a position of 10,000 shares, this is a R$1.00 error per price update.

**Why it happens:**
IEEE 754 floating-point representation makes "28.47" actually `28.469999999999997` in most environments. Cumulative across all positions, all updates, all users, the error grows.

**Consequences:**
- PnL calculations drift from the actual value
- Reported net worth does not match the real total

**Prevention:**
Use `Math.round(price * 100)` — but always validate the input first: if `price` has more than 2 decimal places in the API response (e.g., `1.2345`), use `Math.round(Number(price.toFixed(2)) * 100)` or use a decimal library (`decimal.js`) for the conversion step:

```typescript
// Safe conversion from API float to integer cents
function priceToCents(apiPrice: number): number {
  // toFixed(2) rounds to 2 decimal places before multiplication
  return Math.round(Number(apiPrice.toFixed(2)) * 100)
}
```

This pattern should live in `core-finance` next to existing integer-cents utilities.

**Detection:**
- PnL totals differ by R$0.01-R$0.10 per position compared to brokerage statements
- `asset_prices.price_cents` has values that don't correspond to a 2-decimal price × 100

**Phase to address:** Auto-pricing phase — add `priceToCents()` to `core-finance` before writing the first price-fetch function.

---

### Pitfall 9: Auto-reconciliation matches salary deposits as duplicates of investment dividends

**What goes wrong:**
The auto-reconciliation engine uses `(account_id, date ± 1 day, amount_cents)` to match imported bank transactions against existing portfolio events. A dividend payment of R$1,200.00 was recorded as a portfolio event (investment engine). The bank import also shows a R$1,200.00 credit. These are the same real-world transaction but the auto-matcher may also match a salary deposit of R$1,200.00 that happens to arrive the same week.

**Why it happens:**
Common Brazilian portfolio values make amount collisions frequent: round numbers (R$500, R$1,000, R$2,000), salary transfers, monthly rent amounts, FII dividend payments. The reconciliation window of ±1 day is wide enough to catch valid matches but also catches coincidental matches.

**Consequences:**
- A salary deposit is silently reconciled against a dividend event and disappears from cash flow
- Cash flow reports undercount income
- User cannot find where their salary "went"

**Prevention:**
1. Never auto-reconcile without user confirmation when there are multiple plausible matches in the window
2. For the investment↔cashflow reconciliation path (portfolio event → bank transaction match), add a direction check: only match a bank credit to a dividend event, never to an expense event
3. Add a `source_type` discriminator to matches: `(portfolio_event, bank_import)` vs `(manual_entry, bank_import)` — different confidence thresholds for each
4. The existing `Conciliação no import com matching e preview por transação` (v1.0) is the right UX pattern — always show matches before confirming, never silently auto-confirm

**Detection:**
- Salary or regular income missing from cash flow reports after enabling auto-sync
- Portfolio events with `reconciled_transaction_id` pointing to non-dividend transactions

**Phase to address:** Reconciliation phase — the matching algorithm must have direction-awareness from the start.

---

### Pitfall 10: Boleto settlement date vs. payment date causes off-by-one-day reconciliation failures

**What goes wrong:**
The user pays a boleto on Tuesday at 14:00. The bank books the debit in their account on Tuesday (payment date). However, the beneficiary's account receives the credit on Wednesday (settlement date, D+1 after 13:30). Both dates appear in different contexts in the Open Finance API response. The existing manually-entered transaction was recorded with Tuesday's date. The imported transaction has Wednesday's date (settlement). Reconciliation fails the date match.

**Why it happens:**
Boleto settlement follows a T+1 schedule: payments made after 13:30 on a business day are settled the next business day. The bank's API may return either `bookingDate` or `transactionDate`, which differ by one day. Open Finance Brasil returns `dataLancamento` (booking date) in transaction payloads, but user-entered transactions use the payment intent date.

**Consequences:**
- Valid reconciliation match is missed because dates differ by 1 day
- Transaction is imported as a new entry instead of reconciling the existing one
- Boleto appears twice: manual entry + import

**Prevention:**
1. Use a `±2 day` date window for boleto-type transactions (identified by transaction type or description pattern), not `±1 day`
2. In the reconciliation UI, show the date discrepancy as a note: "Imported date: Wed 2026-04-02 | Existing date: Tue 2026-04-01 — possible boleto settlement delay"
3. Treat `type = 'BOLETO'` transactions as requiring manual confirmation even if amount matches — never auto-confirm boleto matches without date flag

**Detection:**
- Manual boleto expense entries not matching API-imported transactions
- Duplicate boleto transactions after import where one is dated the day before the other

**Phase to address:** Reconciliation phase — the matching window must be configurable by transaction type, not a global constant.

---

## Moderate Pitfalls

### Pitfall 11: Auto-categorization overwrites user-corrected categories on API-imported transactions

**What goes wrong:**
This is the same pitfall documented in v1.1 (Pitfall 1 in the previous section), but it is more dangerous in the Open Finance context because imports happen automatically on a schedule, not only when the user explicitly triggers an import. The user corrects a category at 9am; the auto-sync fires at 10am and resets it silently.

**Prevention:**
The `category_id IS NULL` guard (already planned for v1.1) must be applied to all import paths, including the scheduled Open Finance sync. Add a `category_source` column (`'auto'`, `'manual'`, `'rule'`) and never overwrite `'manual'` with any automated process.

**Phase to address:** Auto-categorization phase — the `category_source` guard is a prerequisite, not an afterthought.

---

### Pitfall 12: Token/credential storage in plain Supabase RLS table

**What goes wrong:**
Pluggy and Belvo issue API access tokens and item IDs that act as bearer credentials for a user's bank connection. If these are stored in a normal Supabase table (even with RLS), they are at risk from: (a) a `service_role` key leak, (b) an RLS policy misconfiguration (the Lovable CVE-2025-48757 pattern), or (c) Supabase MCP tooling leaking queries to assistants.

**Prevention:**
1. Store aggregator access tokens encrypted at rest — use Supabase Vault (`vault.secrets`) or an encrypted column (pgcrypto AES-256) rather than a plain `text` column
2. Store only the `item_id` (Pluggy's reference identifier) in the application database, not the full access token — retrieve the access token from Vault only in Edge Functions at sync time
3. Apply extra-restrictive RLS on the `bank_connections` table: no `SELECT` for `anon` role, no direct client-side reads

**Phase to address:** Open Finance Connection phase — the security model for credential storage must be designed before the first token is persisted.

---

### Pitfall 13: Webhook endpoint unprotected — replay attacks and fake events

**What goes wrong:**
Pluggy and Belvo send webhooks to the application when sync completes or consent changes. If the webhook endpoint has no signature verification, an attacker can send fake events: trigger a fake `transactions/created` to insert phantom transactions, or a fake `item/error` to disconnect all users.

**Prevention:**
1. Pluggy supports webhook signature verification — validate the `x-pluggy-signature` header on every incoming webhook
2. Reject any webhook that does not pass signature validation with a `403`
3. Make the webhook endpoint idempotent: processing the same event twice must produce the same result (use the event ID as an idempotency key in a `processed_webhook_events` table)

**Phase to address:** Open Finance Connection phase — signature verification must be in the webhook handler from day one.

---

### Pitfall 14: Netlify scheduled function timing drift breaks the price update schedule

**What goes wrong:**
Netlify Scheduled Functions have a documented timing imprecision — community reports of 31-minute intervals executing at alternating 31/29/31/29 intervals rather than strict 31-minute gaps. For price updates, a function scheduled at market close may occasionally run 2 minutes early (while B3 is still open) and fetch mid-session prices instead of closing prices.

**Prevention:**
1. Schedule the price update function at 19:00 BRL (UTC-3 = 22:00 UTC) — well after B3 closes at 17:30 BRL — giving a 90-minute buffer that absorbs any Netlify timing drift
2. Do not rely on Netlify Scheduled Functions for SLA-critical operations (consent renewal, payment-triggered reconciliation) — use Supabase pg_cron + Edge Functions for reliability-sensitive jobs
3. Add a `market_session_check` guard in the price update function: if the current time is before 17:45 BRL, log a warning and skip the update

**Phase to address:** Auto-pricing phase — schedule times must be designed with buffer for drift.

---

### Pitfall 15: First-time Open Finance sync triggers full balance recalculation on all accounts

**What goes wrong:**
Connecting a bank account via Open Finance imports months of historical transactions. Each inserted transaction triggers the existing `updateAccountBalance` function (or equivalent). With 200 transactions inserted in batch, the balance is recalculated 200 times instead of once, causing: (a) N sequential DB updates, (b) `revalidatePath` called 200 times flooding Next.js cache, (c) Supabase rate limiting on rapid sequential updates.

**Prevention:**
1. Batch all Open Finance imports in a single transaction: collect all new transactions, insert them all, then compute the final balance delta in one update
2. Defer `revalidatePath` until the entire batch is complete — call it once after all inserts
3. Use the existing `balance_cents + ${delta}` atomic update pattern but apply it as the sum of all deltas, not per-transaction

**Phase to address:** Open Finance Connection phase — batch import path must differ from single-transaction insert path.

---

## Minor Pitfalls

### Pitfall 16: CoinGecko coin IDs vs. ticker symbols mismatch

**What goes wrong:**
CoinGecko uses `coingecko_id` (e.g., `"bitcoin"`, `"usd-coin"`) not ticker symbols (BTC, USDC). The user's asset is stored as `"BTC"`. The price update job calls CoinGecko with `ids=BTC` — returns no data. Crypto prices never update.

**Prevention:**
Maintain a `coingecko_id` column on the `assets` table for crypto assets. Pre-populate with a mapping for the most common assets (BTC→bitcoin, ETH→ethereum, SOL→solana, USDC→usd-coin, etc.). Show the CoinGecko ID field in the asset creation form for crypto.

**Phase to address:** Auto-pricing phase — schema must include `coingecko_id` before the price fetch logic is built.

---

### Pitfall 17: TED/DOC transactions include bank fees as part of the transaction amount in some institutions

**What goes wrong:**
Some banks (particularly older institutions) include their TED fee (typically R$6-R$20) in the transaction amount returned by Open Finance. The user manually recorded the TED as R$1,000. The API returns R$1,006. Reconciliation fails because amounts differ by R$6.

**Prevention:**
1. In the reconciliation matcher, add an `amount_tolerance_cents` of 50 (R$0.50) for transactions classified as TED/DOC — slightly fuzzy matching for fees
2. When showing a near-match in the review UI, highlight the amount difference and note "possible fee included"

**Phase to address:** Reconciliation phase — add as a known exception to the matching rules.

---

### Pitfall 18: International assets (BDRs, ETFs) have prices in USD but portfolio is in BRL

**What goes wrong:**
The user holds IVVB11 (an ETF that tracks S&P 500 in BRL) and also holds direct US stocks (via a broker). brapi.dev returns IVVB11 in BRL (correct). But for direct US holdings, prices may be in USD. The portfolio summary shows mixed currencies without conversion, producing a nonsensical total.

**Prevention:**
1. Every asset must have a `currency` field (`BRL` or `USD`)
2. The price update job fetches the BRL/USD exchange rate (from brapi.dev or BCB API) and stores it in `economic_indicators`
3. PnL computation in `core-finance` always converts to BRL before aggregating

**Phase to address:** Auto-pricing phase — this is a schema prerequisite for the Investments Engine.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Open Finance Connection | Duplicate transactions from OFX/API overlap (Pitfall 1) | Require user to set connection start date; never backfill into manual-import period |
| Open Finance Connection | Pluggy ID instability on bank amendments (Pitfall 2) | Store `provider_transaction_id` separately; handle `transactions/deleted` webhooks |
| Open Finance Connection | Stale connection with no user alert (Pitfall 4) | Webhook-driven status updates + staleness check + email notification |
| Open Finance Connection | BCB monthly per-CPF rate limit (Pitfall 5) | Daily sync schedule; global asset dedup; manual sync rate-limit |
| Open Finance Connection | Credential/token storage in plain DB column (Pitfall 12) | Supabase Vault for aggregator tokens |
| Open Finance Connection | Webhook replay attacks (Pitfall 13) | Signature verification on every webhook |
| Open Finance Connection | Batch import balance recalculation storm (Pitfall 15) | Single-transaction batch inserts with one balance update |
| Auto-Pricing | Thundering herd on price API (Pitfall 6) | Global `asset_prices` table; fetch once per unique ticker |
| Auto-Pricing | Renda fixa treated as market-quoted (Pitfall 7) | `pricing_type` enum; accrual computation in `core-finance` |
| Auto-Pricing | Float-to-cents precision error (Pitfall 8) | `priceToCents()` utility using `.toFixed(2)` before multiply |
| Auto-Pricing | CoinGecko ID vs. ticker mismatch (Pitfall 16) | `coingecko_id` column on assets schema |
| Auto-Pricing | Netlify scheduler timing drift (Pitfall 14) | Schedule after 19:00 BRL; use pg_cron for critical jobs |
| Auto-Pricing | Currency mismatch USD/BRL (Pitfall 18) | `currency` column + exchange rate in `economic_indicators` |
| Reconciliation | PIX same-amount false match (Pitfall 3) | 3-tier matching hierarchy; always show review UI for ambiguous matches |
| Reconciliation | Salary reconciled against dividend (Pitfall 9) | Direction-awareness in matcher; require user confirmation for portfolio↔bank matches |
| Reconciliation | Boleto date offset D+1 (Pitfall 10) | ±2 day window for boleto-type; surface date discrepancy in UI |
| Reconciliation | TED/DOC fee included in amount (Pitfall 17) | R$0.50 tolerance for TED/DOC transactions |
| Auto-Categorization | Scheduled sync overwrites manual categories (Pitfall 11) | `category_source` guard; `IS NULL` condition before any auto-apply |

---

## The Migration Trap: Adding Automation to a Manual-First System

This is the meta-pitfall specific to this project's situation — v2.0 is adding automation to a system that users already trust with manual workflows.

**What goes wrong:**
Users who have been manually managing their data for months have established mental models: "I import, I review, I approve." When automation runs silently in the background and changes data — reconciling a transaction, updating a category, adding a price — users experience it as the system "messing with my data." Even correct automatic actions erode trust if users cannot understand why something changed.

**Three specific trust-breaking patterns:**
1. A manually-entered transaction disappears after reconciliation (the manual entry was marked as reconciled/absorbed by the imported one — correct behavior, confusing UX)
2. A category changes between page loads (scheduled sync ran and auto-categorized)
3. Portfolio value jumps between sessions (price update ran)

**Prevention:**
1. Every automated action must be auditable: `transactions.last_modified_by` should distinguish `'user'` from `'sync:pluggy'` from `'price_update'` from `'categorization_rule'`
2. Show a "What changed?" section on the dashboard after any background sync: "3 new transactions imported, 2 auto-categorized, 1 awaiting review"
3. Never auto-delete or auto-merge a manually-created transaction — reconciliation should link, not replace
4. Provide a one-click "undo last sync" for the most recent automated import (soft-delete the imported batch, restore previous state)

**Phase to address:** All phases — the audit trail and "what changed" notification system should be built as part of the Open Finance Connection phase, before auto-categorization and auto-reconciliation go live.

---

## Sources

- [Pluggy Transactions documentation](https://docs.pluggy.ai/docs/transactions) — Transaction ID hash derivation, delete+recreate behavior on amendments (HIGH confidence — official docs)
- [Pluggy Item Lifecycle documentation](https://docs.pluggy.ai/docs/item-lifecycle) — Item states, MFA limitations, auto-sync retry behavior (HIGH confidence — official docs)
- [Pluggy Consents and expiration](https://docs.pluggy.ai/docs/consents) — Consent expiry behavior, renewal flow, non-expiring default (HIGH confidence — official docs)
- [Belvo OFDA Brazil Data Retrieval Limits](https://developers.belvo.com/products/aggregation_brazil/aggregation-brazil-data-retrieval-limits) — Per-CPF monthly limit, `operational_limits_reached` error (MEDIUM confidence — page rendered CSS-only, confirmed via search)
- [BC acaba com limite de 12 meses — Finsiders Brasil](https://finsidersbrasil.com.br/regulamentacao/bc-acaba-com-limite-de-12-meses-para-compartilhamento-de-dados-no-open-finance/) — Consent period changed to indefinite (Oct 2023) (HIGH confidence — multiple sources confirm)
- [brapi.dev Pricing](https://brapi.dev/pricing) — Plan tiers, request quotas, data delay per tier (HIGH confidence — official pricing page)
- [Sync Account Transactions via Open Banking APIs Without Unique Transaction IDs — Enable Banking](https://enablebanking.com/blog/2024/10/29/how-to-sync-account-transactions-from-open-banking-apis-without-unique-transaction-ids) — 3-field matching algorithm, ambiguity handling (HIGH confidence — authoritative technical blog)
- [Netlify Scheduled Functions timing drift — community forum](https://answers.netlify.com/t/netlify-scheduled-functions-cron-executing-at-31-29-31-29-intervals-instead-of-31-min-intervals/114132) — Timing imprecision documented (MEDIUM confidence — community report, no official acknowledgment)
- [Supabase pg_cron debugging guide](https://supabase.com/docs/guides/troubleshooting/pgcron-debugging-guide-n1KTaz) — pg_cron reliability, permission issues (HIGH confidence — official docs)
- [CoinGecko rate limits — official support](https://support.coingecko.com/hc/en-us/articles/4538771776153-What-is-the-rate-limit-for-CoinGecko-API-public-plan) — 30 calls/min free tier (HIGH confidence — official support article)
- [Boleto compensation D+0 / D+1 — FEBRABAN](https://portal.febraban.org.br/noticia/4072/pt-br/) — Boleto settlement timing rules (HIGH confidence — official banking federation)
- [Lovable CVE-2025-48757 — Superblocks analysis](https://www.superblocks.com/blog/lovable-vulnerabilities) — RLS bypass risk with plain DB credential storage (MEDIUM confidence — security research, confirmed against Supabase RLS docs)
- [Pluggy Webhook documentation](https://docs.pluggy.ai/docs/webhooks) — Webhook retry behavior, 5-second response requirement (HIGH confidence — official docs)

---

*Pitfalls research for: Open Finance integration, auto-pricing, auto-reconciliation, auto-categorization (v2.0) — Floow financial SaaS*
*Researched: 2026-03-29*
