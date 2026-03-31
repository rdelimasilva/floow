# Architecture: Open Finance & Data Automation Integration

**Domain:** Financial SaaS — Open Finance bank sync, asset price updates, auto-reconciliation, auto-categorization
**Researched:** 2026-03-29
**Confidence:** HIGH (codebase analysis + verified external API docs)

---

## Existing Architecture Anchors (Non-Negotiable)

| Pattern | Source | New Code Must Follow |
|---------|--------|----------------------|
| Cron → internal API route (service role key) | `cfo-daily.mts` → `/api/cfo/run-daily` | YES — all new crons |
| Webhook → raw body + header verify → 200 fast | `/api/webhooks/stripe/route.ts` | YES — Open Finance webhook |
| Server actions for user mutations | `lib/finance/import-actions.ts` | YES — no new user-facing API routes |
| ON CONFLICT DO NOTHING + externalId dedup | `uq_transactions_external_account` index | YES — auto-import reuses unchanged |
| Integer cents for money | Throughout | YES — convert external decimals × 100 at boundary |
| Service role key for background writes | Stripe webhook, CFO cron | YES — all background jobs |
| orgId scoping on every table | All existing tables | YES — new tables same pattern |
| Pure function + thin DB wrapper | `core-finance` package | YES — computation pure, DB thin |

---

## New Tables

### `global_asset_prices`
```sql
CREATE TABLE global_asset_prices (
  ticker      text    NOT NULL,
  price_date  date    NOT NULL,
  price_cents integer NOT NULL,
  source      text    NOT NULL,  -- 'brapi' | 'coingecko'
  updated_at  timestamp NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticker, price_date)
);
```
Global (no orgId) — avoids N-duplicate writes per org for the same ticker. Existing `asset_prices` (per-org) remains for manual overrides. No RLS; service role writes, all authenticated can SELECT. Upsert: ON CONFLICT (ticker, price_date) DO UPDATE.

### `bank_connections`
```sql
bank_connections
  id                uuid  PK
  org_id            uuid  NOT NULL REFERENCES orgs(id) ON DELETE CASCADE
  account_id        uuid  NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
  provider          text  NOT NULL DEFAULT 'pluggy'
  pluggy_item_id    text  NOT NULL   -- widget onSuccess value
  pluggy_account_id text             -- resolved after first sync
  status            text  NOT NULL   -- 'active'|'error'|'waiting_user_input'|'outdated'
  last_sync_at      timestamp
  consent_expires_at timestamp       -- Open Finance Brasil: 12-month window
  error_message     text
  created_at / updated_at  timestamp NOT NULL DEFAULT NOW()
  UNIQUE (org_id, pluggy_item_id)
```

### `sync_jobs`
```sql
sync_jobs
  id                    uuid  PK
  connection_id         uuid  NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE
  org_id                uuid  NOT NULL  -- denormalized for query perf
  trigger               text  NOT NULL  -- 'webhook'|'manual'|'cron'
  status                text  NOT NULL  -- 'pending'|'running'|'completed'|'failed'
  started_at / completed_at  timestamp
  transactions_found / imported / skipped  integer DEFAULT 0
  error_message         text
  created_at            timestamp NOT NULL DEFAULT NOW()
  INDEX (connection_id, created_at DESC)
  INDEX (org_id, status, created_at DESC)
```

### `assets` column addition
Migration 00023 adds `coingecko_id text` to `assets`. CoinGecko uses full names (bitcoin, ethereum) not tickers — required for crypto price lookups.

---

## New Netlify Crons

| File | Schedule | Route | Purpose |
|------|----------|-------|---------|
| `netlify/functions/price-update.mts` | `0 19 * * 1-5` | `/api/prices/update-daily` | B3+crypto prices 1h after market close |
| `netlify/functions/process-sync-queue.mts` | `*/15 * * * *` | `/api/open-finance/process-sync-queue` | Drain pending sync jobs |

Both follow `cfo-daily.mts` exactly: call internal route with `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`.

**Limits:** Max 30s execution. `process-sync-queue` processes LIMIT 3 per run — each job makes multiple Pluggy API calls (5-10s each); 10 jobs sequential would blow the 30s budget. Queue drains across runs. `*/15` is valid cron syntax but only `@hourly` is explicitly documented by Netlify — test in staging, fall back to `@hourly` if needed.

---

## New API Routes

| Route | Auth | Caller |
|-------|------|--------|
| `POST /api/open-finance/connect-token` | User session | Client widget init |
| `POST /api/webhooks/open-finance` | `X-Pluggy-Secret` header | Pluggy platform |
| `POST /api/open-finance/process-sync-queue` | Service role key | Netlify cron |
| `POST /api/prices/update-daily` | Service role key | Netlify cron |

---

## External API Specs

**brapi.dev (B3 stocks, FIIs, ETFs):**
- `GET https://brapi.dev/api/quote/{tickers}?token={TOKEN}` — comma-batched tickers
- Free: 15k req/month, ~30min delay. Startup: 150k/month.
- Response: `results[].regularMarketPrice` (decimal BRL) → `Math.round(price * 100)`
- Production token required even on free plan (free without token: 4 tickers only)
- Confidence: HIGH (verified brapi.dev/docs + brapi.dev/pricing)

**CoinGecko (crypto):**
- `GET https://api.coingecko.com/api/v3/simple/price?ids={coingecko_ids}&vs_currencies=brl`
- Free Demo: 30 calls/min, 10k calls/month — sufficient for daily cron
- Confidence: HIGH (verified CoinGecko support docs)

**Pluggy (Open Finance aggregator):**
- Covers 90% of Brazilian bank accounts, follows Open Finance Brasil regulated standard
- `CLIENT_ID` + `CLIENT_SECRET` → API key (2h TTL), server-only
- Server creates `connectToken` (30min TTL) for client-side widget
- Webhook retry: up to 9 attempts (3 immediate, 3 after 1h, 3 after 2h). Must respond 2XX within 5s.
- Transaction fields: `id` (UUID → externalId), `date` (ISO8601 UTC), `amount` (decimal → ×100), `type` (DEBIT/CREDIT), `status` (POSTED/PENDING — import POSTED only), `description`
- Confidence: HIGH (verified docs.pluggy.ai)

---

## Data Flows

### Price Update
```
[Cron 19:00 UTC weekdays] → POST /api/prices/update-daily
  → SELECT DISTINCT ticker, asset_class, coingecko_id FROM assets
  → brapi.dev (B3/FII/ETF batch) + CoinGecko (crypto by coingecko_id)
  → UPSERT global_asset_prices (ticker, today, cents)
  → recalculate assetPositionSnapshots for affected orgs
```

### Bank Connection OAuth
```
[User: Connect Bank] → POST /api/open-finance/connect-token
  → server: CLIENT_SECRET → Pluggy API key → connectToken
  → <PluggyConnect widget> → bank OAuth → onSuccess(itemId)
  → Server Action: saveConnection(itemId, accountId)
  → INSERT bank_connections
  → [Pluggy fires item/created webhook]
```

### Open Finance Sync (Webhook-Triggered)
```
[Pluggy webhook] → POST /api/webhooks/open-finance
  verify X-Pluggy-Secret → INSERT sync_jobs {status:'pending'} → return 200

[Cron, up to 3 jobs per run] → POST /api/open-finance/process-sync-queue
  SELECT sync_jobs WHERE status='pending' LIMIT 3
  for each job:
    GET Pluggy /items/{id} → resolve pluggy_account_id
    GET Pluggy /transactions (paginated, POSTED only, since last_sync_at)
    normalize: ISO date → Date, decimal → cents, DEBIT → negative, id → externalId
    reconcileTransactions() [pure fn] → 'new'|'duplicate'|'possible_match'
    matchCategory(description, rules) [pure fn]
    INSERT transactions ON CONFLICT DO NOTHING
    UPDATE account balance atomically: sql`balance_cents + ${delta}`
    invalidateTag(transactionsTag, accountsTag, recentTransactionsTag)
    UPDATE bank_connections SET last_sync_at = NOW()
    UPDATE sync_jobs SET status='completed', counts
```

---

## Modified Files

| File | Change |
|------|--------|
| `packages/core-finance/src/import/reconcile.ts` | NEW — extract `reconcileTransactions()` from `import-actions.ts` lines 128-183 |
| `packages/core-finance/src/index.ts` | ADD export for reconcile.ts |
| `packages/db/src/schema/investments.ts` | ADD `globalAssetPrices` table |
| `packages/db/src/schema/open-finance.ts` | NEW — `bankConnections`, `syncJobs` tables |
| `packages/db/src/index.ts` | ADD exports for new tables |
| `apps/web/lib/finance/import-actions.ts` | MODIFY to call extracted `reconcileTransactions()` |
| `apps/web/lib/investments/queries.ts` | MODIFY to join `global_asset_prices` |

### New Lib Modules
| File | Purpose |
|------|---------|
| `lib/open-finance/pluggy-client.ts` | Server-only Pluggy API wrapper (API key refresh, typed) |
| `lib/open-finance/connection-actions.ts` | Server actions: saveConnection, disconnect, triggerManualSync |
| `lib/open-finance/sync-pipeline.ts` | `runSyncJob(jobId)` — full sync pipeline |
| `lib/prices/brapi-client.ts` | brapi.dev wrapper (batched) |
| `lib/prices/coingecko-client.ts` | CoinGecko wrapper |
| `lib/prices/update-daily.ts` | Orchestrates fetch → normalize → upsert |

### New UI
| Route | Purpose |
|-------|---------|
| `app/(app)/settings/connected-accounts/page.tsx` | Connect/disconnect UI + sync job history (shows possible_match counts per job for user review) |

---

## Migrations

| Migration | Contents |
|-----------|---------|
| `00021_open_finance.sql` | `bank_connections`, `sync_jobs` + RLS policies |
| `00022_global_asset_prices.sql` | `global_asset_prices` (no RLS) |
| `00023_assets_coingecko_id.sql` | `ALTER TABLE assets ADD COLUMN coingecko_id text` |

---

## Reconciliation Pure Function

The matching logic in `import-actions.ts` lines 128-183 becomes:

```typescript
// packages/core-finance/src/import/reconcile.ts
export interface ReconcileResult {
  tx: NormalizedTransaction
  status: 'new' | 'duplicate' | 'possible_match'
  matchedTransactionId?: string
}
export function reconcileTransactions(
  parsed: NormalizedTransaction[],
  existing: ExistingTransaction[]  // { id, date, amountCents, externalId }
): ReconcileResult[]
```

Extraction only — algorithm unchanged. Existing server action tests remain the validation gate.

---

## Build Order

**Phase 1 — Price Updates** (independent, immediate value):
global_asset_prices table → coingecko_id migration → brapi/coingecko clients → `/api/prices/update-daily` → `price-update.mts` → investments queries read from global table

**Phase 2 — Bank Connection OAuth** (independent of sync):
bank_connections table → pluggy-client → connect-token route → connection-actions → connected-accounts UI

**Phase 3 — Webhook + Sync Pipeline** (depends on Phase 2):
sync_jobs table → extract reconcileTransactions() → webhook route → sync-pipeline → process-sync-queue route → cron

**Phase 4 — Auto-Categorization** (free — already handled in Phase 3 via matchCategory()):
Optional: add sync history table to connected-accounts page showing possible_match counts

Phase 1 is fully independent and can be built in parallel with Phases 2-3.

---

## Security

| Concern | Mitigation |
|---------|-----------|
| Pluggy CLIENT_SECRET | Server-only env var, never logged, never sent to client |
| Webhook authenticity | `PLUGGY_WEBHOOK_SECRET` verified in `X-Pluggy-Secret` header before any processing |
| Background job auth | Service role key in Authorization header |
| RLS bypass | Use service role Supabase client for all background jobs (no user session) |
| Consent expiry | `consent_expires_at` on bank_connections; UI prompts re-consent |
| Duplicate delivery | sync_jobs idempotency + ON CONFLICT DO NOTHING on transactions |

---

## Open Questions

1. **`*/15` cron on Netlify:** Test in staging — only `@hourly` is documented minimum. Fall back to `@hourly` if needed. (MEDIUM confidence)
2. **Pluggy production pricing:** Not publicly listed. Verify before production launch. (LOW confidence)
3. **Pluggy `consentExpiresAt`:** Does Pluggy surface this field on the item object, or must app compute from connection date? (MEDIUM confidence)
4. **coingecko_id population:** Migration adds the column; a seed mapping for top 20 coins or a user-fill UI is needed. (HIGH confidence — required for crypto price updates)
5. **brapi.dev token:** Register before shipping — free tier without token only covers 4 tickers. (HIGH confidence)

---

## Sources

- Pluggy: https://docs.pluggy.ai/docs/webhooks, /docs/transactions, /docs/authentication, /docs/setup-two-way-sync-with-webhooks
- brapi.dev: https://brapi.dev/docs, https://brapi.dev/pricing
- CoinGecko: https://support.coingecko.com/hc/en-us/articles/4538771776153
- Netlify: https://docs.netlify.com/build/functions/scheduled-functions/
- Codebase: `netlify/functions/cfo-daily.mts`, `/api/webhooks/stripe/route.ts`, `lib/finance/import-actions.ts`, `packages/db/src/schema/`
