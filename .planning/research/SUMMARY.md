# Project Research Summary

**Project:** Floow v2.0 — Open Finance & Asset Price Automation
**Domain:** Brazilian personal finance SaaS adding automated data ingestion to a manual-first system
**Researched:** 2026-03-29
**Confidence:** HIGH (stack, architecture, pitfalls), MEDIUM (Pluggy production pricing)

## Executive Summary

The core risk for Floow v2.0 is not technical — it is trust. Users who have managed their data manually for months have an established mental model: "I import, I review, I approve." When automation runs silently and changes data — reconciling a transaction, updating a category, adding a price — users experience it as the system messing with their data. Every automated action must be auditable, every background change surfaced in a "what changed" UI, and no manual entry should ever be deleted or replaced by an automated process. This trust preservation requirement cuts across all four phases and must be designed in from the start, not retrofitted.

The recommended technical approach is straightforward: Pluggy as the Open Finance aggregator (BACEN-authorized ITP, 70+ Brazilian institutions, R$2,500/month production), brapi.dev for B3 equities (Startup plan, ~R$50-60/month — verify exact price before purchasing), and CoinGecko Demo (free) for crypto. All scheduling follows the existing `cfo-daily.mts` Netlify Scheduled Function pattern with in-code `Config.schedule`. New work is organized into four build phases with a clear dependency order: Prices first (fully independent, immediate portfolio value), then Bank Connection, then Sync Pipeline, then Auto-Categorization (nearly free once Phase 3 is built).

The heaviest concentration of risk sits in Phase 2 (Bank Connection). Seven of the ten critical pitfalls land here: OFX/API duplicate overlap when a user first connects, Pluggy transaction ID instability on bank amendments, silent consent revocation, BCB per-CPF monthly rate limits, insecure credential storage, webhook replay attacks, and batch-import balance recalculation storms. Building Phase 2 carefully — with webhook signature verification, daily-only sync schedules, Supabase Vault for tokens, and a batched import path — prevents the most damaging failure modes. Phase 1 (Prices) should be built first precisely because it has none of this complexity.

---

## Key Findings

### Recommended Stack

The existing stack (Next.js 16, TypeScript, Tailwind, shadcn/ui, Drizzle ORM, Supabase, Netlify, Turborepo monorepo) requires only three net-new external dependencies: `pluggy-sdk` (server-side, Netlify Functions only — Node.js, not Deno-compatible), `pluggy-connect-sdk` (browser-only widget), and `fastest-levenshtein` (300-byte string-distance utility for reconciliation). All price APIs (brapi.dev, CoinGecko, BCB dados abertos) are plain REST with native `fetch()` — no library required.

**Core technologies (additions only):**
- `pluggy-sdk` + Pluggy account: Open Finance aggregator — BACEN-authorized, 70+ BR institutions, TypeScript-native, R$2,500/month production
- `pluggy-connect-sdk`: Browser widget for bank OAuth — aggregator handles full consent flow; app never sees bank credentials
- brapi.dev Startup plan: B3/FII/ETF/BDR prices — ~R$50-60/month, 150k req/month, 15-min delay (verify price before purchase — STACK.md vs FEATURES.md discrepancy noted)
- CoinGecko Demo API: Crypto prices in BRL — free tier (10k/month) sufficient for launch; no library
- BCB dados abertos API: CDI/SELIC rates for fixed income valuation — free, no auth, no library
- `fastest-levenshtein@^1.0.16`: Levenshtein distance for fuzzy reconciliation matching — 300 bytes, zero deps
- Netlify Scheduled Functions: All cron jobs follow existing `cfo-daily.mts` pattern with in-code `Config.schedule`

**Scheduling decision (resolved):** Use Netlify Scheduled Functions as the default. FEATURES.md mentions Supabase pg_cron + Edge Functions, but the codebase already has `cfo-daily.mts` establishing the Netlify pattern and all Pluggy operations require Node.js (Netlify), making pg_cron a redundant extra hop. Exception: if Netlify's `*/15` cron syntax fails in staging (Pitfall 14), fall back to pg_cron for the 15-minute queue drain job only.

See `.planning/research/STACK.md` for full provider comparison, runtime compatibility matrix, and installation commands.

### Expected Features

The v2.0 feature set wires existing v1.0 foundations to live external data sources. Most critical plumbing already exists: `externalId` unique index for dedup, `matchCategory()` rule engine, `estimateAssetValue()` for fixed income, OFX reconciliation preview UI.

**Must have (table stakes for launch):**
- Bank connection via Pluggy widget with consent management UI (grant/revoke/renew/status badges)
- Daily auto-sync of bank transactions with webhook-driven triggering
- Connection health monitoring: error alerts, stale detection, reconnect prompts
- Exact + fuzzy duplicate detection in sync preview (reuse existing reconciliation preview UI)
- Apply existing category rules (`matchCategory()`) on all imported transactions
- Daily close prices for B3 equities, FIIs, ETFs, BDRs (brapi.dev)
- Daily crypto prices in BRL (CoinGecko)
- CDI/SELIC rates for fixed income valuation (BCB API)
- "Last updated" timestamps and manual price override for uncovered assets

**Should have (competitive differentiators):**
- Investment event detection: cross-match dividend payments from bank sync to `portfolioEvents`
- Historical price backfill on first brapi.dev connection (12 months via Startup plan)
- Price staleness alerts when prices exceed 2 trading days old
- Connection quality score (% of syncs that succeeded in last 30 days)
- Per-asset price source display (brapi/CoinGecko/BCB/manual)

**Defer to v3+:**
- ML/AI-based categorization (rule engine achieves 80-90% accuracy; cold-start problem makes ML not viable yet)
- Open Finance investment sync via BCB Phase 4 (inconsistent brokerage compliance)
- PIX payment initiation (separate regulated service, different product scope)
- Real-time sub-5-minute B3 prices (requires exchange license; not available via affordable brapi tiers)

See `.planning/research/FEATURES.md` for full competitor analysis and feature dependency graph.

### Architecture Approach

All new code follows established codebase patterns without exception. Scheduled jobs follow `cfo-daily.mts`: Netlify Function calls an internal Next.js API route authenticated with the service-role key. Webhooks follow the Stripe webhook pattern: verify header, write raw payload to queue table, return 202 immediately, drain queue via cron. User mutations use Server Actions. Money values use integer cents converted at the API boundary with `Math.round(Number(price.toFixed(2)) * 100)`.

**Major components:**
1. `global_asset_prices` table — global, no orgId; one row per (ticker, date); brapi + CoinGecko upsert here; prevents thundering-herd API waste
2. `bank_connections` + `sync_jobs` tables — per-org bank connection state and job audit trail; `sync_jobs` provides "what changed" visibility
3. `packages/core-finance/src/import/reconcile.ts` — extracted pure function from existing `import-actions.ts` lines 128-183; unchanged algorithm, relocated for reuse
4. `lib/open-finance/sync-pipeline.ts` — `runSyncJob(jobId)` orchestrating Pluggy fetch → normalize → reconcile → categorize → batch insert → single balance update
5. `lib/prices/` — brapi client, CoinGecko client, orchestration; all plain `fetch()`, no libraries
6. Netlify crons: `price-update.mts` (daily 19:00 UTC weekdays) + `process-sync-queue.mts` (every 15 min); both call internal API routes

**Three required migrations:**
- `00021_open_finance.sql`: `bank_connections`, `sync_jobs`, RLS policies
- `00022_global_asset_prices.sql`: `global_asset_prices` (no RLS, service-role writes, all-auth reads)
- `00023_assets_coingecko_id.sql`: `ALTER TABLE assets ADD COLUMN coingecko_id text`

See `.planning/research/ARCHITECTURE.md` for full data flow diagrams, file map, and open questions.

### Critical Pitfalls

1. **OFX/API duplicate overlap on first connect (Pitfall 1)** — Require user to set a "connection start date" during the wizard; never backfill into the manual-import period; always show review preview on initial sync
2. **Pluggy transaction ID instability (Pitfall 2)** — Store `provider_transaction_id` (bank's `providerCode`) separately from Pluggy's hash ID; handle `transactions/deleted` webhooks with soft-delete + user alert, not hard delete
3. **PIX same-amount false reconciliation matches (Pitfall 3)** — Use a 3-tier hierarchy: providerCode exact match (high confidence) → date+amount (medium, require review) → anything else (no auto-match); never auto-confirm ambiguous matches
4. **Thundering herd on price APIs (Pitfall 6)** — `global_asset_prices` table enforces one API call per unique ticker regardless of how many orgs hold it; CoinGecko batches up to 250 coins per request
5. **Fixed income treated as market-quoted (Pitfall 7)** — Add `pricing_type` enum (`market_quoted` vs `accrual_based`) to assets schema; route CDB/LCI/LCA/Tesouro to `computeAccrualPrice()`, never to brapi.dev
6. **Automation eroding user trust (meta-pitfall)** — Every automated action tagged with `last_modified_by` source; "what changed" summary shown after each sync; no manual entry ever auto-deleted

See `.planning/research/PITFALLS.md` for all 18 pitfalls with detection queries and phase-specific warnings.

---

## Implications for Roadmap

### Phase 1: Asset Price Updates

**Rationale:** Fully independent of bank connections — no consent complexity, no webhook infrastructure. Delivers immediate visible value (live portfolio prices) and establishes the `global_asset_prices` architecture that Phase 3 depends on. Lowest risk, fastest win.
**Delivers:** Live B3/FII/ETF/BDR prices, crypto prices in BRL, CDI/SELIC for fixed income; portfolio views show market prices instead of manual entries
**Addresses:** All asset price table-stakes features; `global_asset_prices` table; `pricing_type` enum on assets
**Avoids:** Thundering herd (Pitfall 6), renda fixa mispricing (Pitfall 7), float-to-cents errors (Pitfall 8), CoinGecko ID mismatch (Pitfall 16), Netlify scheduler drift (Pitfall 14 — schedule 19:00 UTC with 90-min buffer after market close)
**Schema prerequisites:** Migrations 00022 + 00023 before any code
**Research flag:** Standard patterns — skip `/gsd:research-phase`

### Phase 2: Bank Connection & Consent Lifecycle

**Rationale:** Highest-risk phase — 7 of 10 critical pitfalls land here. Must be built before Phase 3 (sync pipeline depends on bank connections existing). Pluggy production pricing is unconfirmed; webhook signature format needs staging verification; consent lifecycle behavior needs validation.
**Delivers:** Pluggy widget integration, connect/disconnect/reconnect UI, connection health dashboard, webhook receiver (enqueue only — returns 202, does not process), consent expiry alerts, connection status badges
**Addresses:** All Open Finance connection table-stakes features from FEATURES.md
**Avoids:** Credential storage (Pitfall 12 — Supabase Vault, not plain column), webhook replay (Pitfall 13 — signature verification from day one), stale connection (Pitfall 4 — webhook status updates + staleness check + email notification), batch balance storm (Pitfall 15 — batch import path designed before first sync), BCB rate limit (Pitfall 5 — daily sync only, not hourly)
**Schema prerequisites:** Migration 00021 before any code
**Research flag:** Needs `/gsd:research-phase` — Pluggy production pricing (not publicly listed), webhook signature header name, `consentExpiresAt` field availability on item object, coingecko_id seed strategy for top 20 coins

### Phase 3: Sync Pipeline & Reconciliation

**Rationale:** Depends on Phase 2 (bank connections must exist). The algorithmically complex phase — reconciliation matching, fuzzy dedup, batch import, atomic balance update.
**Delivers:** Daily auto-sync, transaction dedup (exact via externalId + fuzzy via providerCode + 3-tier matching), reconciliation preview (MATCHED/DUPLICATE/NEW), connection start-date enforcement, sync job audit trail, `runSyncJob()` orchestration
**Addresses:** Reconciliation table-stakes features; `reconcileTransactions()` pure function extraction; `process-sync-queue` API route + Netlify cron
**Avoids:** OFX/API overlap (Pitfall 1 — connection start date), Pluggy ID instability (Pitfall 2 — store providerCode), PIX false matches (Pitfall 3 — 3-tier matching), salary/dividend confusion (Pitfall 9 — direction-aware matcher), boleto date offset (Pitfall 10 — ±2 day window for boleto type), TED fee tolerance (Pitfall 17)
**Research flag:** Standard patterns for reconciliation algorithm — skip `/gsd:research-phase`. Matching thresholds (0.7 similarity, ±2 day window) should be validated with real transaction data in staging.

### Phase 4: Auto-Categorization & Audit Trail

**Rationale:** Nearly free — `matchCategory()` already exists and is called inside Phase 3's sync pipeline. The primary work is the `category_source` guard and the audit trail / "what changed" UI that makes all prior automation trustworthy to users.
**Delivers:** Auto-categorization on sync with `category_source` guard, "what changed" sync summary dashboard, `last_modified_by` audit column, uncategorized filter prominence post-sync
**Addresses:** Auto-categorization table-stakes features; meta-pitfall trust preservation
**Avoids:** Scheduled sync overwriting manual categories (Pitfall 11 — `category_source` guard is a prerequisite before any scheduled sync goes live)
**Research flag:** Standard patterns — skip `/gsd:research-phase`

### Phase Ordering Rationale

- Phase 1 before Phase 2: Price updates deliver standalone value with zero consent/webhook risk. Validates the Netlify cron pattern and pricing architecture before the higher-complexity phases.
- Phase 2 before Phase 3: Sync pipeline requires bank connections to exist. Phase 2's webhook receiver creates the `sync_jobs` queue that Phase 3 drains.
- Phase 3 before Phase 4: Auto-categorization runs inside the sync pipeline. Phase 4 adds the `category_source` guard as an extension of Phase 3, not a separate system. The guard must be in place before scheduled syncs go live.
- Phase 1 and Phases 2-3 are parallelizable by different team members if capacity allows — they share no code dependencies.

### Research Flags

Needs `/gsd:research-phase` during planning:
- **Phase 2 (Bank Connection):** Pluggy production pricing not publicly listed; webhook signature header name needs staging verification; `consentExpiresAt` field availability on item object; coingecko_id seed mapping strategy for top 20 coins

Standard patterns, skip research:
- **Phase 1 (Prices):** brapi.dev and CoinGecko REST APIs are well-documented; Netlify cron pattern established by existing `cfo-daily.mts`
- **Phase 3 (Sync Pipeline):** Pluggy transaction API well-documented; reconciliation is ~60 lines TypeScript extending existing code
- **Phase 4 (Auto-Categorization):** `matchCategory()` already exists; audit trail is additive schema work

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All provider choices verified against official docs; SDK compatibility confirmed; one gap: pluggy-sdk npm version (verify at install — npm page returned 403 during research) |
| Features | HIGH | Table stakes verified against Pluggy/Belvo docs and BR competitor evidence (Mobills, Organizze, Kinvo); MVP scope is conservative and appropriate |
| Architecture | HIGH | Based on direct codebase analysis + verified external API docs; all patterns are extensions of established codebase patterns |
| Pitfalls | HIGH (structural), MEDIUM (BR-specific limits) | BCB per-CPF rate limit confirmed via secondary source only; Netlify timing drift is community-reported, not officially documented |

**Overall confidence:** HIGH

### Gaps to Address

- **brapi.dev Startup plan price:** STACK.md says R$59.99/month, FEATURES.md says R$49.99/month. Verify on brapi.dev/pricing before purchasing. Both files sourced from brapi.dev but on different dates — price may have changed.
- **Pluggy production pricing:** R$2,500/month Basic confirmed; Growth/enterprise tiers not publicly listed. Confirm with Pluggy sales before committing to launch timeline.
- **`*/15` cron syntax on Netlify:** Only `@hourly` is explicitly documented minimum. Test in staging for `process-sync-queue.mts`; fall back to `@hourly` if it fails (queue drains hourly — acceptable for v2.0 launch).
- **`consentExpiresAt` field availability:** Whether Pluggy surfaces this on the item object or requires app-side computation. Verify in Pluggy sandbox before building consent renewal UI.
- **coingecko_id seed mapping:** Migration 00023 adds the column; a seed mapping for top 20 coins (BTC→bitcoin, ETH→ethereum, SOL→solana, USDC→usd-coin, etc.) is needed before crypto price updates work. Decide before Phase 1 coding: seed via migration or asset-creation UI.

---

## Sources

### Primary (HIGH confidence)
- https://docs.pluggy.ai — webhooks, transactions, authentication, item lifecycle, consent lifecycle
- https://www.pluggy.ai/pricing — R$2,500/month Basic plan confirmed
- https://brapi.dev/docs + https://brapi.dev/pricing — endpoints, bearer auth, plan tiers
- https://www.coingecko.com/en/api/pricing + CoinGecko support docs — Demo plan limits, BRL support confirmed
- https://docs.netlify.com/build/functions/scheduled-functions/ — 30-second limit, `Config.schedule` pattern confirmed
- https://dadosabertos.bcb.gov.br — CDI series 12, SELIC series 11; free, no auth
- Codebase: `netlify/functions/cfo-daily.mts`, `/api/webhooks/stripe/route.ts`, `lib/finance/import-actions.ts`, `packages/db/src/schema/`

### Secondary (MEDIUM confidence)
- https://belvo.com/plans-and-pricing/ — Belvo pricing cross-reference for provider comparison
- https://developers.belvo.com/products/aggregation_brazil/aggregation-brazil-data-retrieval-limits — BCB per-CPF rate limit (page rendered CSS-only; confirmed via search)
- https://answers.netlify.com/t/netlify-scheduled-functions-cron-executing-at-31-29-31-29-intervals — timing drift community report
- https://www.npmjs.com/package/pluggy-sdk — SDK version (npm page returned 403; verify at install)

### Tertiary (LOW confidence, informational only)
- https://www.index.dev/skill-vs-skill/api-integration-plaid-vs-belvo-vs-pluggy-latam — provider comparison cross-reference only

---
*Research completed: 2026-03-29*
*Ready for roadmap: yes*
