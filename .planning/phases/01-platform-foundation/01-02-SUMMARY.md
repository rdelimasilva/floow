---
phase: 01-platform-foundation
plan: 02
subsystem: data-layer
tags: [drizzle, supabase, rls, postgresql, multi-tenant, jwt, vitest]

# Dependency graph
requires:
  - 01-01 (monorepo scaffold, @floow/db stub, pnpm workspace)
provides:
  - Drizzle ORM schema: orgs, profiles, orgMembers, subscriptions tables with TypeScript types
  - SQL migration 00001_foundation.sql with RLS policies, indexes, trigger, JWT hook
  - createDb factory and db singleton exported from @floow/db
  - get_user_org_ids() SECURITY DEFINER function for performant multi-tenant RLS
  - on_auth_user_created trigger (auto-creates personal org + profile + subscription on signup)
  - custom_access_token_hook for injecting org_ids into JWT app_metadata
  - Wave 0 RLS test stubs satisfying AUTH-05 validation requirement
affects: [01-03-PLAN, 01-04-PLAN, all-subsequent-phases]

# Tech tracking
tech-stack:
  added:
    - drizzle-orm/pg-core table definitions (pgTable, pgEnum, uuid, text, timestamp, boolean, unique)
    - postgres driver (createDb factory pattern)
    - drizzle-kit (drizzle.config.ts for schema-to-migration generation)
    - supabase/config.toml (local dev configuration)
  patterns:
    - SECURITY DEFINER function pattern for performant RLS (get_user_org_ids)
    - select-wrapped auth.uid() — (SELECT auth.uid()) — for per-row performance
    - btree indexes on all org_id columns referenced in RLS policies
    - EXCEPTION WHEN OTHERS in trigger to prevent blocking signups
    - Drizzle schema as single source of truth, SQL migration for RLS/triggers/functions
    - createDb(connectionString) factory + db singleton for dual anon/service_role pattern

key-files:
  created:
    - packages/db/src/schema/auth.ts
    - packages/db/src/schema/billing.ts
    - packages/db/src/client.ts
    - packages/db/drizzle.config.ts
    - supabase/config.toml
    - supabase/migrations/00001_foundation.sql
    - supabase/seed.sql
    - packages/db/src/__tests__/schema.test.ts
    - packages/db/src/__tests__/rls.test.ts
  modified:
    - packages/db/src/index.ts (barrel export for schema + client)
    - packages/db/vitest.config.ts (fixed glob pattern bug)

key-decisions:
  - "Drizzle schema and SQL migration are maintained separately — Drizzle for TypeScript types, SQL for RLS/triggers/functions Drizzle cannot express"
  - "RLS uses get_user_org_ids() SECURITY DEFINER helper — avoids nested RLS on org_members per row, critical for query performance"
  - "on_auth_user_created trigger wrapped in EXCEPTION WHEN OTHERS — prevents any trigger error from blocking user signup"
  - "createDb factory exports both anon key (RLS enforced) and service_role (RLS bypassed) client patterns"

# Metrics
duration: 42min
completed: 2026-03-10
---

# Phase 1 Plan 02: Supabase Schema and Drizzle ORM Summary

**Drizzle schema with typed table exports plus SQL migration with RLS policies, SECURITY DEFINER helper function, auto-create-org trigger, and JWT claims hook for multi-tenant isolation**

## Performance

- **Duration:** 42 min
- **Started:** 2026-03-10T19:17:19Z
- **Completed:** 2026-03-10T19:59:41Z
- **Tasks:** 2
- **Files created:** 9
- **Files modified:** 2

## Accomplishments

- Drizzle ORM schema defining 4 tables (orgs, profiles, orgMembers, subscriptions) with 4 enums and inferred TypeScript types exported from @floow/db
- SQL migration 00001_foundation.sql with all tables, 4 btree indexes, 4 RLS-enabled tables, 16 RLS policies using the performant select-wrapped pattern
- SECURITY DEFINER get_user_org_ids() helper function preventing nested RLS lookups
- on_auth_user_created trigger creating personal org + profile + org_member (owner) + free subscription on every signup
- custom_access_token_hook for injecting org_ids into JWT app_metadata
- Supabase local dev config (config.toml) with floow project_id, auth redirects for web and mobile
- Wave 0 test stubs: schema.test.ts (5 passing, 2 todo) and rls.test.ts (4 todo for AUTH-05)

## Task Commits

Each task was committed atomically:

1. **Task 1: Define Drizzle schema for auth and billing tables** - `73af8ac` (feat)
2. **Task 2: Create Supabase migration with RLS, triggers, indexes, and Wave 0 test stubs** - `7b5add9` (feat)

## Files Created/Modified

- `packages/db/src/schema/auth.ts` - orgs, profiles, orgMembers tables + orgTypeEnum, memberRoleEnum
- `packages/db/src/schema/billing.ts` - subscriptions table + planTierEnum, subscriptionStatusEnum
- `packages/db/src/client.ts` - createDb(connectionString) factory + db singleton reading DATABASE_URL
- `packages/db/src/index.ts` - barrel export of schema/auth, schema/billing, client
- `packages/db/drizzle.config.ts` - Drizzle kit config pointing to src/schema/*.ts
- `supabase/config.toml` - Supabase local dev config (project_id=floow, auth redirects)
- `supabase/migrations/00001_foundation.sql` - Complete SQL migration (tables, RLS, indexes, trigger, JWT hook)
- `supabase/seed.sql` - Empty seed file with placeholder comment
- `packages/db/src/__tests__/schema.test.ts` - Schema export verification tests (5 passing, 2 todo)
- `packages/db/src/__tests__/rls.test.ts` - Wave 0 AUTH-05 RLS integration test stubs (4 todo)
- `packages/db/vitest.config.ts` - Fixed glob pattern (bug auto-fix)

## Decisions Made

- **Separate Drizzle schema and SQL migration:** Drizzle schema provides TypeScript types; SQL migration provides RLS policies, triggers, and SECURITY DEFINER functions that Drizzle cannot express. Both are maintained independently — Drizzle is the TypeScript source of truth, SQL is the runtime source of truth.
- **get_user_org_ids() SECURITY DEFINER:** RLS policies reference this helper instead of joining org_members inline. Avoids nested RLS recursion and enables Postgres query planner to cache the result per statement.
- **EXCEPTION WHEN OTHERS in trigger:** Any unhandled exception in handle_new_user() rolls back the auth.users INSERT — blocking signup. The exception handler logs warnings but never re-raises, ensuring all signup methods succeed.
- **createDb + db singleton pattern:** Two export styles: createDb(url) for controlled connections (e.g., service_role for admin ops), and db singleton for convenience (reads DATABASE_URL, typically anon key for user-context queries with RLS enforced).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vitest glob pattern in vitest.config.ts**
- **Found during:** Task 2 (running `pnpm --filter @floow/db test`)
- **Issue:** Existing vitest.config.ts from Plan 01-01 used `*.{test,spec}.{ts}` — the `{ts}` brace group caused vitest to find no test files
- **Fix:** Changed to standard `*.{test,spec}.ts` pattern
- **Files modified:** packages/db/vitest.config.ts
- **Commit:** 7b5add9 (included in Task 2 commit)

**2. [Rule 3 - Blocking] Created supabase/ directory manually instead of via `pnpm dlx supabase init`**
- **Found during:** Task 2 (setting up Supabase local dev)
- **Issue:** `supabase init` is interactive CLI requiring user input — not suitable for automation. The plan intent is to have the config files present, not to run the interactive wizard.
- **Fix:** Created supabase/ directory structure and config.toml directly with the required configuration values from the plan spec
- **Files modified:** supabase/config.toml (created)
- **Commit:** 7b5add9 (included in Task 2 commit)

## Issues Encountered

- Vitest glob pattern bug was pre-existing from Plan 01-01 but only manifested when the first test files were added in this plan. Auto-fixed via Rule 1.
- Supabase CLI interactive init is not automatable — created files directly per plan spec intent.

## User Setup Required

To run Supabase locally:
```bash
# Install Supabase CLI (if not installed)
brew install supabase/tap/supabase

# Start local Supabase (requires Docker)
supabase start

# Apply migrations
supabase db reset

# Run RLS integration tests
pnpm --filter @floow/db test
```

The RLS test stubs in `rls.test.ts` are marked `todo` — they require a running Supabase instance and will be implemented when AUTH-05 integration tests are written.

## Next Phase Readiness

- @floow/db exports typed Drizzle tables — ready for auth flows in Plan 01-03
- SQL migration is ready to apply when Supabase local dev is started
- RLS wave 0 stubs exist for AUTH-05 validation
- No blockers.

---
*Phase: 01-platform-foundation*
*Completed: 2026-03-10*
