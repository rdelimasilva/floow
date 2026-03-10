---
phase: 01-platform-foundation
plan: 04
subsystem: payments
tags: [stripe, webhooks, billing, freemium, checkout, customer-portal, next-js, server-actions, zod]

# Dependency graph
requires:
  - 01-01 (monorepo scaffold, Next.js 15 web app, shadcn/ui components)
  - 01-02 (subscriptions table with plan_tier, status, stripe_customer_id columns)
  - 01-03 (Supabase server/browser clients, auth middleware, app shell layout)
provides:
  - Stripe lazy server client (getStripeServer) + createCheckoutSession + createPortalSession helpers
  - Plan definitions (PLANS) with free/pro tiers, R$19.90/mo and R$199/yr pricing
  - Webhook handler at /api/webhooks/stripe handling all subscription lifecycle events
  - PlanCard client component with monthly/annual toggle and upgrade CTA
  - SubscriptionStatus client component with status badge and manage subscription button
  - /billing server page with createCheckout and openPortal server actions
  - /billing/success confirmation page after Stripe Checkout
  - Billing Zod schemas (planTierSchema, subscriptionStatusSchema) in @floow/shared
  - Webhook unit tests (6 passing, mock-based)
affects: [all-subsequent-phases, all-features-behind-plan-gates]

# Tech tracking
tech-stack:
  added:
    - "stripe ^17.7.0 — server-side Stripe SDK for checkout sessions, portal, webhook verification"
    - "@stripe/stripe-js ^8.9.0 — browser Stripe.js lazy loader for client-side checkout redirect"
  patterns:
    - "Lazy Stripe server client: getStripeServer() instantiates Stripe only on first call, not at module level — avoids build-time errors when STRIPE_SECRET_KEY absent during Next.js static prerender"
    - "Webhook uses request.text() (NEVER request.json()) for raw body — required for Stripe signature verification"
    - "Webhook uses service_role Supabase client (createClient with service key) to bypass RLS — no user session in webhook context"
    - "Server actions for checkout/portal: server-side org resolution + Stripe redirect, no client-side API calls"
    - "client_reference_id set to orgId for webhook correlation (checkout.session.completed -> subscriptions table update)"

key-files:
  created:
    - apps/web/lib/stripe/client.ts
    - apps/web/lib/stripe/server.ts
    - apps/web/lib/stripe/plans.ts
    - apps/web/app/api/webhooks/stripe/route.ts
    - apps/web/app/(app)/billing/page.tsx
    - apps/web/app/(app)/billing/success/page.tsx
    - apps/web/components/billing/plan-card.tsx
    - apps/web/components/billing/subscription-status.tsx
    - packages/shared/src/schemas/billing.ts
    - apps/web/__tests__/billing/webhook.test.ts
  modified:
    - apps/web/app/(app)/layout.tsx (added Dashboard + Plano nav links)
    - packages/shared/src/index.ts (added re-export of schemas/billing)

key-decisions:
  - "Lazy Stripe client instantiation via getStripeServer() factory — established as project pattern for all external service clients in Next.js App Router (mirrors Supabase client pattern from 01-03)"
  - "Webhook correlation uses client_reference_id=orgId (not userId) — billing is org-scoped, not user-scoped"
  - "Server actions for checkout/portal (not API routes) — simpler, co-located with billing page, no extra endpoint needed"
  - "Stripe pricing in Brazilian Real (BRL): R$19.90/mo = 1990 cents, R$199/yr = 19900 cents per CONTEXT.md spec"

patterns-established:
  - "Pattern: Lazy external service client — getStripeServer() called inside functions, never at module level"
  - "Pattern: Webhook service role client — createClient(url, service_role_key) for webhook handlers with no user session"
  - "Pattern: Server action checkout flow — server action resolves org, calls helper, redirect() to Stripe URL"

requirements-completed: [BILL-01, BILL-02, BILL-03]

# Metrics
duration: 35min
completed: 2026-03-10
---

# Phase 1 Plan 04: Stripe Billing Summary

**Stripe freemium billing with lazy server client, checkout sessions, Customer Portal, and webhook lifecycle handler for plan_tier/status sync in subscriptions table**

## Performance

- **Duration:** 35 min
- **Started:** 2026-03-10T21:44:45Z
- **Completed:** 2026-03-10T22:19:25Z
- **Tasks:** 2 of 3 complete (Task 3 = human-verify checkpoint awaiting approval)
- **Files created:** 10
- **Files modified:** 2

## Accomplishments

- Complete Stripe integration: lazy server client, createCheckoutSession (with existing customer reuse), createPortalSession — all with correct URL patterns
- Webhook handler covering all 5 Stripe events (checkout.session.completed, subscription.updated/deleted, invoice.payment_succeeded/failed) using request.text() raw body + signature verification + service_role client
- Billing UI: PlanCard with monthly/annual toggle, SubscriptionStatus with color-coded badges, /billing page with server actions, /billing/success confirmation page
- Billing Zod schemas (planTierSchema, subscriptionStatusSchema) exported from @floow/shared
- 6 unit tests passing (mock-based, no Stripe API key required) covering all webhook event types

## Task Commits

Each task was committed atomically:

1. **Task 1: Stripe server config, plan definitions, webhook handler, and billing schemas** - `2c39ec7` (feat)
2. **Task 2: Billing page UI with plan cards, upgrade flow, and subscription status** - `38b147a` (feat)
3. **Task 3: Verify billing flows end-to-end** - human-verify checkpoint — awaiting user approval

## Files Created/Modified

- `apps/web/lib/stripe/client.ts` - getStripe() lazy loadStripe browser loader
- `apps/web/lib/stripe/server.ts` - getStripeServer() lazy client + createCheckoutSession + createPortalSession
- `apps/web/lib/stripe/plans.ts` - PLANS constant with free/pro tiers, getPlanByPriceId, formatPrice (BRL)
- `apps/web/app/api/webhooks/stripe/route.ts` - Webhook POST handler with request.text(), all lifecycle events
- `apps/web/app/(app)/billing/page.tsx` - Server page: subscription fetch + createCheckout/openPortal server actions
- `apps/web/app/(app)/billing/success/page.tsx` - Checkout success confirmation with session_id display
- `apps/web/components/billing/plan-card.tsx` - Client component: plan info, monthly/annual toggle, upgrade button
- `apps/web/components/billing/subscription-status.tsx` - Client component: status badge, period end, manage button
- `packages/shared/src/schemas/billing.ts` - planTierSchema, subscriptionStatusSchema + TypeScript types
- `apps/web/__tests__/billing/webhook.test.ts` - 6 unit tests covering all webhook event types
- `apps/web/app/(app)/layout.tsx` - Added Dashboard and Plano nav links to header
- `packages/shared/src/index.ts` - Added re-export of schemas/billing

## Decisions Made

- **Lazy Stripe client:** `new Stripe(key)` at module level causes "Neither apiKey nor config.authenticator provided" during Next.js static page collection. Applied same fix pattern as Plan 01-03 Supabase clients — instantiate inside functions only. This is now the established project pattern for all external SDK clients.
- **Server actions for billing:** createCheckout and openPortal are server actions co-located in the billing page file. No separate API routes needed — simpler and avoids extra indirection.
- **org-scoped billing:** client_reference_id = orgId (not userId) because subscriptions are per-org. Webhook updates subscriptions by org_id or stripe_customer_id depending on event type.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lazy Stripe server client to avoid Next.js build-time error**
- **Found during:** Task 2 (build verification `pnpm turbo run build --filter=@floow/web`)
- **Issue:** `export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)` at module level throws "Neither apiKey nor config.authenticator provided" during Next.js static page data collection when STRIPE_SECRET_KEY is not set in the build environment. Build exits with code 1.
- **Fix:** Replaced module-level `stripe` export with `getStripeServer()` lazy factory (instantiates on first call). Re-exported a `stripe` proxy object with the same shape for backward compatibility with webhook handler imports.
- **Files modified:** `apps/web/lib/stripe/server.ts`
- **Verification:** `pnpm turbo run build --filter=@floow/web` passes — 11 routes built including /billing and /api/webhooks/stripe
- **Committed in:** 38b147a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — build-time instantiation)
**Impact on plan:** Auto-fix necessary for correct production build. No scope creep. Establishes lazy client pattern as project standard (mirrors 01-03 Supabase fix).

## Issues Encountered

- Build-time Stripe client instantiation followed the same root cause as the Plan 01-03 Supabase client issue. Applied identical lazy-initialization fix. Now a documented project pattern: all external service SDK clients must be instantiated lazily inside functions, not at module level.

## User Setup Required

The following Stripe configuration is required before billing flows work end-to-end:

**Environment variables required (apps/web/.env.local):**
```
STRIPE_SECRET_KEY=sk_test_...          # Stripe Dashboard -> Developers -> API keys -> Secret key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...  # Stripe Dashboard -> Developers -> API keys -> Publishable key
STRIPE_WEBHOOK_SECRET=whsec_...        # Stripe CLI: stripe listen --forward-to localhost:3000/api/webhooks/stripe
STRIPE_PRO_MONTHLY_PRICE_ID=price_...  # After creating Pro product in Stripe Dashboard
STRIPE_PRO_ANNUAL_PRICE_ID=price_...   # After creating Pro product in Stripe Dashboard
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Stripe Dashboard configuration:**
1. Create Product "Floow Pro" with monthly (R$19.90 = BRL 19.90) and annual (R$199 = BRL 199) prices
2. Create webhook endpoint pointing to `{deployed_url}/api/webhooks/stripe`
3. Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
4. Enable Customer Portal: Settings -> Billing -> Customer Portal

**Local webhook forwarding:**
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Next Phase Readiness

- Billing system code complete: webhook handler, checkout, portal, UI all in place
- Plan gates are wired: subscriptions.plan_tier drives feature access for all future phases
- All Phase 1 code complete — pending Task 3 human verification of billing flows
- Task 3 checkpoint awaiting user approval before plan is marked fully complete

## Self-Check: PASSED

Key files verified present on disk:
- apps/web/lib/stripe/client.ts — FOUND
- apps/web/lib/stripe/server.ts — FOUND
- apps/web/lib/stripe/plans.ts — FOUND
- apps/web/app/api/webhooks/stripe/route.ts — FOUND
- apps/web/app/(app)/billing/page.tsx — FOUND
- apps/web/app/(app)/billing/success/page.tsx — FOUND
- apps/web/components/billing/plan-card.tsx — FOUND
- apps/web/components/billing/subscription-status.tsx — FOUND
- packages/shared/src/schemas/billing.ts — FOUND
- apps/web/__tests__/billing/webhook.test.ts — FOUND

Commits verified:
- 2c39ec7 (Task 1) — FOUND
- 38b147a (Task 2) — FOUND

---
*Phase: 01-platform-foundation*
*Completed: 2026-03-10 (partial — Task 3 pending human verify)*
