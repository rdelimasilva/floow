# Phase 1: Platform Foundation - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Monorepo scaffold (Turborepo, pnpm), Supabase project with PostgreSQL + RLS, multi-method authentication (email/password, magic link, OAuth Google/Apple), Stripe billing (freemium plans, checkout, subscription management, webhooks). Both web (Next.js) and mobile (Expo) apps scaffolded with auth flows working. No financial features — this is the SaaS skeleton.

</domain>

<decisions>
## Implementation Decisions

### Tenant Model
- Multi-org per user — a user can belong to multiple organizations (e.g., personal + family + business)
- Signup automatically creates a personal org — user lands on dashboard immediately, no wizard
- All data is scoped via org_id — every table has org_id, RLS enforces tenant isolation
- No data exists outside of an org context (even user preferences are org-scoped)
- Org switcher UX: Claude's discretion (dropdown in header recommended)

### Auth Experience
- All auth methods presented equally on screen — Google, Apple, email/password, magic link as peer options
- Single page with tabs for Login/Signup (not separate routes)
- After email/password signup: block access until email is verified (redirect to "check your email" screen)
- Magic link and OAuth skip verification (email already confirmed by provider)
- Visual style: clean/minimal — white background, centered logo, clean form (reference: Linear, Vercel)

### Monorepo Scaffold
- Namespace: `@floow/*` for all packages (@floow/db, @floow/shared, @floow/core-finance, etc.)
- Shared logic only between web and mobile — hooks, types, Zod schemas, business logic via @floow/shared
- UI is separate per platform: shadcn/ui for web, React Native Paper/Tamagui for mobile
- Database: `packages/db` as dedicated Turborepo package with Drizzle schema, migrations, and client
- Mobile app in Phase 1 mirrors web — same auth screens and empty dashboard shell
- core-finance package created but empty in Phase 1 (populated in Phase 2)

### Claude's Discretion
- Stripe plan structure (free tier limits, premium features, pricing tiers, trial period)
- Org switcher component design and placement
- Loading states, error pages, 404/500 pages
- Email templates for verification and magic link
- Exact folder structure within each app
- CI/CD pipeline configuration details

</decisions>

<specifics>
## Specific Ideas

- Auth page visual reference: Linear, Vercel — minimal, professional, no clutter
- Onboarding should feel instant — signup → org created → dashboard, no steps in between
- The `@floow/db` package is the single source of truth for all database types and queries

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, Phase 1 builds everything from scratch

### Established Patterns
- None yet — Phase 1 establishes the foundational patterns all other phases will follow

### Integration Points
- Supabase Auth SDK integrates with both Next.js (SSR) and Expo (client)
- Drizzle ORM in @floow/db will be imported by all apps and functions
- Stripe webhooks will need a Netlify Function endpoint
- RLS policies on every table must reference org_id from auth.users metadata

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-platform-foundation*
*Context gathered: 2026-03-10*
