---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Open Finance & Automação de Dados
status: active
stopped_at: Roadmap created, ready for Phase 8 planning
last_updated: "2026-03-31T00:00:00.000Z"
last_activity: 2026-03-31
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31)

**Core value:** O investidor experiente consegue ver seu patrimônio consolidado — finanças, investimentos e projeções futuras — tudo num único lugar.
**Current focus:** Milestone v2.0 — Open Finance & Automação de Dados

## Current Position

Phase: Phase 8 — Asset Price Updates (not started)
Plan: —
Status: Roadmap created, awaiting Phase 8 planning
Last activity: 2026-03-31 — v2.0 roadmap defined (Phases 8-10)

Progress: [----------] 0%

## Performance Metrics

**Velocity reference (v1.0 + v1.1):**

| Phase | Plans | Duration | Avg/Plan |
|-------|-------|----------|----------|
| 5. Foundation | 1/1 | 4 min | 4 min |
| 6. Categorization | 2/2 | ~6 min | 3 min |
| 7. Recurring | 2/2 | ~11 min | 5.5 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions logged in PROJECT.md Key Decisions table.

**v2.0 provider choices (from research + user input):**
- Open Finance aggregator: Polp (polp.com.br) — NOT Pluggy. User explicitly chose Polp.
- B3/FII/ETF/BDR prices: brapi.dev (Startup plan — verify exact price at brapi.dev/pricing before purchase)
- Crypto prices: CoinGecko Demo API (free, 10k req/month, no library needed)
- BCB indicators (CDI/SELIC/IPCA): BCB dados abertos API (free, no auth, plain fetch)
- String distance for fuzzy matching: `fastest-levenshtein@^1.0.16` (300 bytes, zero deps)

**v2.0 architecture decisions (from research):**
- `global_asset_prices` table is global (no orgId) — one row per (ticker, date); prevents thundering-herd API waste
- Scheduling follows existing `cfo-daily.mts` pattern: Netlify Scheduled Function calls internal Next.js API route authenticated with service-role key
- Price cron scheduled at 19:00 UTC weekdays (90-min buffer after B3 market close at 17:30 BRT)
- Webhooks follow Stripe pattern: verify header, write raw payload to queue, return 202 immediately, drain via cron
- Polp tokens stored in Supabase Vault — never in plain columns
- `pricing_type` enum on assets (`market_quoted` vs `accrual_based`) routes CDB/LCI/LCA/Tesouro to `computeAccrualPrice()`, never to brapi
- Connection start date required during bank connect wizard to prevent OFX/API duplicate overlap
- 3-tier reconciliation hierarchy: exact providerCode match (high confidence) → date+amount (medium, require review) → no auto-match
- Category rules applied only when `category_id IS NULL` — never overwrite manual categories (consistent with v1.1)
- Every automated action tagged with `last_modified_by` source; "what changed" summary shown after each sync

**v1.1 decisions (archived for reference):**
- Category rules apply only when `category_id IS NULL` — never overwrite manual categories
- Recurring generation is user-triggered in v1.1 (cron deferred to v2 as REC-06)
- `(recurring_template_id, due_date)` unique constraint prevents duplicate generation
- `priority` column on rules with `ORDER BY priority DESC` for deterministic conflict resolution
- `date-fns@^4.1.0` is the only new dependency added to core-finance
- Use new Date(Y,M,D) local constructor in tests (not ISO strings) to avoid UTC-3 timezone drift with date-fns v4
- matchCategory does not check isEnabled — callers must pre-filter disabled rules before passing to function
- getCategoryRules() always called outside db.transaction() blocks to prevent connection pool exhaustion
- createRule assigns maxPriority + 10 when no explicit priority given (gap-of-10 strategy)
- isAutoCategorized added to getTransactions explicit select — was missing despite being in schema
- recurring-actions.ts created as separate file — CLAUDE.md 500-line limit blocks adding to actions.ts (1420 lines)
- generateRecurringTransaction stores signed amountCents (income positive, expense negative) to match createTransaction pattern
- assertAccountOwnership exported from actions.ts for reuse in recurring-actions.ts

### Open Questions / Gaps to Verify Before Phase 8 Coding

- **brapi.dev price:** STACK.md says R$59.99/month, FEATURES.md says R$49.99/month — verify at brapi.dev/pricing before purchase
- **coingecko_id seed strategy:** Migration adds the column; a seed mapping for top 20 coins (BTC→bitcoin, ETH→ethereum, etc.) is needed before crypto price updates work — decide: seed via migration or asset-creation UI
- **`*/15` cron syntax on Netlify:** Only `@hourly` explicitly documented; test in staging for `process-sync-queue.mts`, fall back to `@hourly` if it fails
- **Polp API specifics:** Widget integration, webhook signature format, consent lifecycle fields — verify in Polp sandbox before Phase 9 coding

### Pending Todos

None.

### Blockers/Concerns

None at roadmap stage.

## Session Continuity

Last session: 2026-03-31
Stopped at: v2.0 roadmap created (Phases 8-10) — ready for `/gsd:plan-phase 8`
Resume file: None
