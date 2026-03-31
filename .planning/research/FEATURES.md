# Feature Landscape: Open Finance & Auto-Pricing

**Domain:** Open Finance bank connections, automatic asset price updates, auto-reconciliation, auto-categorization of imported transactions in a BR personal finance SaaS
**Researched:** 2026-03-29
**Confidence:** HIGH (BR Open Finance table stakes based on Pluggy/Belvo docs + BR competitor evidence), MEDIUM (reconciliation patterns, scheduling), LOW (ML-based categorization for v2+)

---

## Context: What Already Exists

This is Floow v2.0 — a subsequent milestone on a shipped v1.0 app. The following foundations must NOT be rebuilt:

- `transactions` table with `externalId`, `importedAt`, `isAutoCategorized`, `isIgnored` fields
- `uq_transactions_external_account` unique index on `(externalId, accountId)` — deduplication via ON CONFLICT
- `categorization_rules` with `matchType` (contains/exact), `matchValue`, `categoryId`, `priority`, `isEnabled`
- `matchCategory()` pure function in `core-finance/src/categorization.ts`
- OFX/CSV import pipeline with existing reconciliation and preview flow
- `assets` table with `ticker`, `assetClass` (br_equity, fii, etf, crypto, fixed_income, international)
- `asset-valuation.ts` — `estimateAssetValue()` for rate-based fixed income estimation
- `portfolioEvents` table — buy/sell/dividend/interest/split/amortization events

The new milestone wires these foundations to live external data sources.

---

## Feature Landscape

### Table Stakes — Open Finance Bank Connection

Features BR users expect when they hear "connect your bank." Missing any of these makes the feature feel incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Bank connection via hosted widget | Users expect a native bank-side login flow, not entering credentials in a third-party app — BCB-regulated consent flow is the only compliant path | MEDIUM | Pluggy Connect widget or Belvo hosted widget; iframe/redirect into bank's own consent UI |
| Multi-bank support (Nubank, Itaú, Bradesco, Santander, BB, XP, etc.) | Users have accounts at multiple institutions; single-bank tools feel incomplete | MEDIUM | Aggregators (Pluggy 70+ institutions, Belvo) handle this; app just selects which aggregator connector |
| Consent grant and confirmation UI | BCB regulation mandates user-visible consent scoping (data types, duration) — cannot be hidden | MEDIUM | Aggregator widget handles regulatory flow; app must display what data types were consented and expiry |
| Consent status dashboard (active / expired / revoked) | Users need to see which bank connections are live and manage them; Mobills and Organizze both show this | MEDIUM | Per-connection status badge: active, expired, error, revoked; with "reconnect" CTA |
| Revoke consent from app | BCB mandates users can revoke at any time; app must provide this pathway | LOW | Call aggregator DELETE /item or mark as revoked; does not delete existing transactions |
| Consent renewal when expired | Open Finance BR consents last up to 365 days (BCB limit); some institutions default to 12 months; Inter PJ defaults to 1 year — users must re-consent periodically | MEDIUM | Detect `consentExpiresAt` approaching; show renewal prompt; PATCH /item to restart consent flow |
| Daily auto-sync of transactions | Users expect accounts to update automatically without re-importing OFX files — Mobills charges extra for this; Organizze includes it | HIGH | Requires scheduled background job (Supabase pg_cron → Edge Function); Pluggy auto-syncs every 8–24h depending on plan |
| Connection health / error alerts | Users need to know when a sync failed (bank changed password requirements, consent expired, API error) | MEDIUM | Error state on connection card; email/in-app notification on repeated failures |
| Last synced timestamp per account | Users need to know when data was last pulled — prevents "why is this missing?" support requests | LOW | Store `lastSyncedAt` on connection record; display on account card |
| Import preview before confirming synced transactions | Already established UX pattern from OFX import — users expect to review before committing | MEDIUM | Reuse existing reconciliation preview UI; apply to Open Finance fetched transactions |

### Table Stakes — Auto-Categorization on Import

Features users expect when new transactions arrive via Open Finance.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Apply existing category rules to synced transactions | Users already configured rules in v1.1; they expect them to fire on all transactions, not just manual imports | LOW | `matchCategory()` already exists; call it in the sync pipeline with active rules |
| "Uncategorized" filter for review | After auto-sync, users need to find transactions rules didn't match and categorize manually | LOW | Filter already exists in transaction list; needs to surface prominently after a sync |
| Create rule from transaction shortcut | Users encountering an unmatched Open Finance transaction expect one-click rule creation — already exists in v1.1 | LOW | ALREADY BUILT; verify it still works on Open-Finance-sourced transactions |
| Auto-categorize flag on transaction | Transparency: user needs to see if a category was auto-assigned vs manually set — `isAutoCategorized` column already exists | LOW | ALREADY EXISTS in schema; ensure flag is set correctly in sync pipeline |

### Table Stakes — Asset Price Updates (B3 + Crypto)

Features experienced investors expect from an investment tracker.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Daily close price for B3 equities (ações, FIIs, ETFs, BDRs) | PnL and portfolio value require a current price; manual entry is not acceptable for frequent traders | MEDIUM | brapi.dev covers B3, FIIs, ETFs, BDRs — 400+ tickers; free tier has 30-min delay; Startup plan (R$49.99/mo) gives 15-min delay |
| Daily price for cryptocurrencies | Crypto users check daily; stale prices undermine trust | MEDIUM | CoinGecko Demo API — 30 calls/min, 10k calls/month free; prices in BRL available |
| CDI / SELIC rate for fixed income valuation | Fixed income positions (CDB, LCI, LCA, Tesouro) are priced relative to CDI/SELIC; users expect displayed value to reflect current rate | MEDIUM | BCB dados abertos API — free, no auth required; series code 12 (CDI), 11 (SELIC); `estimateAssetValue()` already exists and can consume these rates |
| "Last updated" timestamp on prices | Users need to know if prices are real-time, delayed, or stale — especially during volatile markets | LOW | Store `priceUpdatedAt` on asset or asset_prices table; display in portfolio view |
| Manual price override | When API doesn't cover an asset (e.g., private equity, niche FI), user must be able to enter price manually | LOW | ALREADY PARTIALLY EXISTS via `current_value_cents` on assets; needs explicit "manual price" flag |

### Table Stakes — Reconciliation (Open Finance vs Existing)

Features users expect to avoid double-counting when they have both manual and synced transaction sources.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Duplicate detection between synced and existing transactions | When a user has both an OFX import AND Open Finance sync for the same account, they expect no duplicates | HIGH | `externalId` unique index provides exact dedup for subsequent Open Finance syncs; cross-source (OFX vs OpenFinance) requires fuzzy matching on (date, amount, description) |
| Match suggestion for near-duplicates | Users manually entered some transactions before connecting their bank; they expect the app to detect and merge these | HIGH | Fuzzy match: exact amount + date within 2 days + description similarity; show match candidate with accept/reject UI |
| "Already exists" indication in import preview | When reviewing synced transactions, users need to see which ones already exist as manual entries | MEDIUM | Extend existing import reconciliation preview to show `MATCHED` / `DUPLICATE` / `NEW` states |
| Skip matched transactions on confirm | When user accepts a match, synced transaction is discarded; existing manual transaction gets `externalId` linked | MEDIUM | Updates existing transaction row rather than inserting new one |

---

## Differentiators — Competitive Advantage

Features that go beyond baseline BR PFM expectations. Given Floow's positioning for experienced investors:

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Investment event detection from bank transactions | When Open Finance syncs a dividend payment from a brokerage account, auto-match it to the corresponding `portfolioEvent` — eliminates double-counting in cash flow | HIGH | Match on (date ± 3 days, amount ±1%, account) between synced transactions and dividend/interest portfolio events; backlog item exists |
| Historical price backfill on first connect | When user connects brapi and they have assets with no price history, backfill last 12 months of EOD prices | HIGH | brapi Pro gives 10+ years; Startup gives 1 year; useful for accurate historical PnL chart |
| Rule learning from user corrections | When user changes a category on a synced transaction, offer "always apply this rule" — reduces future uncategorized count over time | LOW | Already built as "Create rule from transaction" in v1.1; just needs to surface more prominently after sync |
| Price staleness alerts | When prices are older than 2 trading days, surface a warning on the portfolio dashboard | LOW | Compare `priceUpdatedAt` to business-day-adjusted current date; simple banner |
| Per-asset price update source tracking | Show which source (brapi, CoinGecko, BCB, manual) provided each price — builds trust and aids debugging | LOW | `priceSource` enum column on prices table |
| Connection quality score | Show each bank connection's sync reliability (% of scheduled syncs that succeeded last 30 days) — differentiates from apps that silently fail | MEDIUM | Track sync attempt + success in `sync_logs` table; compute score in UI |

---

## Anti-Features — Explicitly Avoid

| Anti-Feature | Why Requested | Why Avoid | Alternative |
|--------------|--------------|-----------|-------------|
| Direct bank credential scraping | Cheaper than Open Finance aggregator, no consent flow needed | Illegal under BCB LGPD/PCI-DSS; aggregators are the only compliant path for BR; credential storage creates catastrophic liability | Use Pluggy or Belvo exclusively |
| Direct BCB Open Finance certification | Full regulatory compliance without aggregator fees | Requires being a registered "Iniciador de Serviços de Pagamento" — BCB application process, legal team, ongoing compliance audits; completely out of scope for a startup SaaS | Aggregator as regulated intermediary; aggregator holds the certification |
| Real-time streaming prices (sub-1-minute) | "I want live prices during market hours" | B3 real-time requires an exchange license (not available via brapi free/affordable tiers); latency <5min adds no value for daily portfolio management | 5–30 min delayed prices from brapi — sufficient for daily review |
| Full ML/AI auto-categorization pipeline | "Smart" categorization without user-defined rules | Requires per-org training data (cold start problem), model serving infra, opaque results. Rule-based achieves 80-90% accuracy for regular users with zero infra cost. | Extend existing `matchCategory()` rule system; add NLP fuzzy matching only if rule accuracy drops below acceptable |
| Open Finance for investment sync (phase 3 of BCB rollout) | Auto-sync investment portfolio from XP/BTG via Open Finance | BCB Phase 4 investment data sharing is available but coverage is inconsistent; brokerages have irregular compliance; high implementation complexity for low reliability | brapi for price data; user manually reconciles portfolio events; Kinvo pattern |
| Automatic split detection of bank transactions | "Grocery store trip = food + household items" | Requires LLM or trained merchant taxonomy; split transactions add a new data model dimension (not in schema); maintenance burden is high | Single category per transaction; user splits manually if needed |
| PIX payment initiation | "Pay directly from Floow" | Payment initiation is a separate regulated service; Pluggy has this as a premium feature but it's a different product scope | Out of scope; this is a personal finance tracker, not a payments app |

---

## Feature Dependencies

```
[Open Finance Bank Connection]
    └──requires──> [Pluggy or Belvo aggregator account + API keys]    NEW external dependency
    └──requires──> [bank_connections table]                           NEW schema
    └──requires──> [Supabase pg_cron + Edge Function for daily sync]  NEW infrastructure
    └──builds-on──> [accounts table]                                  ✓ ALREADY EXISTS
    └──builds-on──> [import preview reconciliation UI]                ✓ ALREADY EXISTS

[Auto-Sync Transaction Pipeline]
    └──requires──> [Open Finance Bank Connection]                     above
    └──requires──> [sync_logs table for health tracking]              NEW schema
    └──builds-on──> [transactions.externalId + uq index]             ✓ ALREADY EXISTS
    └──builds-on──> [importSelectedTransactions action]               ✓ ALREADY EXISTS (reuse or adapt)

[Auto-Categorization on Sync]
    └──requires──> [Auto-Sync Transaction Pipeline]                   above
    └──builds-on──> [matchCategory() + CategoryRule]                 ✓ ALREADY EXISTS
    └──builds-on──> [transactions.isAutoCategorized]                 ✓ ALREADY EXISTS

[Reconciliation / Duplicate Detection]
    └──requires──> [Auto-Sync Transaction Pipeline]                   above
    └──builds-on──> [uq_transactions_external_account unique index]  ✓ ALREADY EXISTS (exact dedup)
    └──requires──> [fuzzy match function (date+amount+desc)]          NEW pure function in core-finance
    └──builds-on──> [import reconciliation preview UI]               ✓ ALREADY EXISTS

[Asset Price Updates — B3 / FIIs / ETFs]
    └──requires──> [brapi.dev API account + key]                     NEW external dependency
    └──requires──> [asset_prices table or priceUpdatedAt on assets]  NEW schema (or extend existing)
    └──requires──> [Supabase pg_cron → Edge Function daily job]      NEW infrastructure (shared with sync)
    └──builds-on──> [assets table with ticker + assetClass]          ✓ ALREADY EXISTS
    └──builds-on──> [portfolio PnL computation (uses price input)]   ✓ ALREADY EXISTS

[Asset Price Updates — Crypto]
    └──requires──> [CoinGecko Demo API key (free)]                   NEW external dependency
    └──builds-on──> [Asset Price Updates infrastructure]             above
    └──builds-on──> [assets.assetClass = 'crypto']                  ✓ ALREADY EXISTS

[CDI / SELIC for Fixed Income]
    └──requires──> [BCB dados abertos API (free, no auth)]           NEW external dependency (no key needed)
    └──builds-on──> [estimateAssetValue() in asset-valuation.ts]     ✓ ALREADY EXISTS
    └──builds-on──> [assets.assetClass = 'fixed_income']            ✓ ALREADY EXISTS
```

### Critical Infrastructure Dependency

All "automatic" features in v2.0 require a **scheduled background job** mechanism. The project runs on Supabase (PostgreSQL) + Netlify (web). Options:

- **Supabase pg_cron** (HIGH confidence, confirmed available) — runs SQL or calls Edge Functions on cron schedule directly in Postgres; monitored via `cron.job_run_details` table; simplest path for this stack
- **Supabase Cron Module** — hosted UI wrapper over pg_cron; GA as of late 2024; recommended

This is the single new infrastructure piece that unlocks daily sync, daily price updates, and consent renewal checks. Both the bank sync job and price update job can share this mechanism.

---

## MVP Definition for v2.0

### Launch With

These constitute the minimum that makes "Open Finance" and "live prices" feel real and useful:

**Open Finance (required for launch):**
- [ ] `bank_connections` table: `orgId`, `accountId`, `aggregatorItemId`, `institutionName`, `status` (active/expired/error/revoked), `consentExpiresAt`, `lastSyncedAt`
- [ ] Pluggy Connect widget integration (or Belvo hosted widget) — aggregator handles BCB consent flow
- [ ] Bank connections management UI: list connected accounts, status badges, disconnect, reconnect
- [ ] Webhook receiver for Pluggy events (transaction updates, consent expiry)
- [ ] Daily sync Edge Function (pg_cron → Edge Function → Pluggy API → insert transactions with ON CONFLICT DO NOTHING)
- [ ] Apply `matchCategory()` rules during sync pipeline (reuse existing rule system)
- [ ] Duplicate / match detection in sync preview (exact dedup via `externalId`, fuzzy suggestion for manual-vs-synced conflicts)
- [ ] Consent expiry notification (in-app banner when `consentExpiresAt` < 14 days)

**Asset Price Updates (required for launch):**

> **Paid API dependency:** brapi.dev free tier covers only 4 hardcoded tickers (PETR4, VALE3, MGLU3, ITUB4). Production use with user-defined portfolios requires the Startup plan at R$49.99/month. This is a recurring cost alongside the aggregator (Pluggy/Belvo). Budget for both before launch.

- [ ] `asset_prices` table: `assetId`, `priceCents`, `source` (brapi/coingecko/bcb/manual), `priceDate`, `updatedAt`
- [ ] brapi.dev Startup plan integration for B3 equities, FIIs, ETFs, BDRs (daily EOD batch, 15-min delay, 150k req/mo)
- [ ] CoinGecko integration for crypto assets (daily batch)
- [ ] BCB dados abertos API for CDI/SELIC rates (daily or weekly batch)
- [ ] Daily price update Edge Function (pg_cron → Edge Function → price APIs → upsert asset_prices)
- [ ] Portfolio views updated to use latest `asset_prices` row instead of manually entered price

### Add After Validation

- [ ] Investment event detection from bank transactions (dividend cross-matching) — high complexity, validate demand first
- [ ] Historical price backfill — useful but adds API cost; gated on paid plan
- [ ] Connection quality score dashboard
- [ ] Per-asset price source display

### Future Consideration (v3+)

- [ ] ML-based categorization improvements on top of rule engine
- [ ] Open Finance investment sync (BCB Phase 4) — coverage too inconsistent currently
- [ ] PIX payment initiation via Pluggy

---

## Competitor Feature Analysis (BR Market)

| Feature | Mobills | Organizze | Kinvo | Floow v2.0 target |
|---------|---------|-----------|-------|-------------------|
| Open Finance bank sync | Yes (paid plan) | Yes (included) | No (investment-focused) | Yes (included in paid plan) |
| Multiple banks | Yes | Yes | N/A | Yes |
| Consent management UI | Basic | Basic | N/A | Full (grant/revoke/renew/status) |
| Auto-categorization on sync | Yes | Yes | N/A | Yes (existing rule engine) |
| Daily price updates (B3) | No | No | Yes (real-time B3 live) | Yes (delayed via brapi) |
| Crypto prices | No | No | Yes | Yes (CoinGecko) |
| Fixed income CDI valuation | No | No | Yes | Yes (BCB API + estimateAssetValue) |
| Duplicate detection | Basic | Basic | N/A | Exact + fuzzy match |
| Reconciliation preview | No | No | N/A | Yes (reuse OFX preview) |

**Key insight:** Kinvo (investment-focused competitor) shows that B3 live prices and fixed income CDI valuation are expected by investment-tracking users, even without Open Finance bank sync. Mobills/Organizze show that bank sync is monetized as a premium feature in BR market — validates Floow's freemium gate.

---

## Complexity Notes for Phase Planning

| Feature Area | Complexity Driver | Approach |
|-------------|------------------|----------|
| Open Finance connection | Aggregator widget integration, consent lifecycle, webhook receiver | MEDIUM — aggregator does the heavy lifting; app provides connection management UI |
| Daily bank sync job | pg_cron scheduling, Pluggy API pagination, error handling, retry | HIGH — new infrastructure pattern; needs monitoring and failure recovery |
| Transaction dedup (exact) | Already solved via `externalId` unique index + ON CONFLICT | LOW — existing schema handles it |
| Transaction dedup (fuzzy) | New pure function in core-finance: date ± N days + exact amount + description similarity | MEDIUM — needs careful threshold tuning to avoid false positives |
| Auto-categorization on sync | Existing `matchCategory()` called in sync pipeline | LOW — mostly plumbing |
| B3 price updates | brapi.dev REST API, daily batch, upsert pattern | MEDIUM — straightforward but needs rate limit awareness; Startup plan required for all tickers |
| Crypto price updates | CoinGecko Demo API, free tier sufficient for daily | LOW — simple REST call, BRL prices available directly |
| CDI/SELIC rate fetch | BCB dados abertos — free, no auth, simple JSON series | LOW — one endpoint, no rate limits documented |
| Portfolio view with live prices | Change data source from manual to `asset_prices` table | MEDIUM — requires query changes, fallback to manual price if no data |

---

## Sources

- [Pluggy Open Finance Connectors](https://docs.pluggy.ai/docs/open-finance-regulated) — data types, institution coverage, premium feature flag
- [Pluggy Transactions API](https://docs.pluggy.ai/docs/transactions) — transaction fields, 12-month history, pagination
- [Pluggy Consents Documentation](https://docs.pluggy.ai/docs/consents) — consent expiration, renewal via PATCH /item, default no expiry / Inter PJ 1 year
- [Belvo Banking Aggregation Brazil](https://developers.belvo.com/products/aggregation_brazil/aggregation-brazil-introduction) — alternative aggregator, consent-based links, data types
- [Belvo Mobills Case Study](https://belvo.com/customer-stories/mobills/) — how Mobills integrated Open Finance via Belvo; confirmed sync pattern
- [Mobills Open Finance Integration Help](https://mobills.zendesk.com/hc/pt-br/articles/17287679665563) — competitor UX pattern reference
- [Organizze Open Finance](https://www.organizze.com.br/blog/gestao-financeira/melhor-app-conectar-contas-bancarias) — competitor feature confirmation
- [Kinvo B3 Live](https://bossainvest.com/kinvo-lanca-acompanhamento-da-b3-ao-vivo-no-app/) — investment-focused competitor; confirmed live B3 price feature
- [brapi.dev Pricing](https://brapi.dev/) — R$0 (4 test tickers), Startup R$49.99/mo (150k req, 15min delay), Pro R$49.99/mo (500k req, 5min delay); 400+ assets: stocks, FIIs, ETFs, BDRs
- [BCB Dados Abertos — SELIC API](https://dadosabertos.bcb.gov.br/dataset/11-taxa-de-juros---selic) — free, series code 11 (SELIC), 12 (CDI)
- [CoinGecko API Pricing](https://www.coingecko.com/en/api/pricing) — Demo plan: 30 calls/min, 10k/month free; BRL prices supported
- [Supabase pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron) — scheduling extension; runs SQL or triggers Edge Functions; monitored via cron.job_run_details
- [Supabase Cron Module](https://supabase.com/modules/cron) — hosted UI for scheduling; GA in Supabase platform
- [Supabase Scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) — pg_cron → Edge Function invocation pattern
- [Fuzzy Matching in Bank Reconciliation](https://optimus.tech/blog/fuzzy-matching-algorithms-in-bank-reconciliation-when-exact-match-fails) — Levenshtein distance for transaction description matching; tiered confidence (95-100% = auto, 85-94% = flag, <85% = manual)
- [Open Finance Brazil — 91M active authorizations](https://www.biia.com/open-finance-enables-brazilian-consumers-by-reshaping-how-they-leverage-financial-data-bcb-insights/) — BCB 2025 adoption stats
- [BCB Open Finance consent max 365 days](https://developers.belvo.com/docs/brazil-open-finance-network-limits) — regulatory consent duration limit

---

*Feature research for: Floow v2.0 — Open Finance & Automação de Dados*
*Researched: 2026-03-29*
