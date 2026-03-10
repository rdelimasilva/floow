---
phase: 01-platform-foundation
plan: 01
subsystem: infra
tags: [turborepo, pnpm, nextjs, expo, drizzle, tailwind, shadcn, vitest, playwright, typescript]

# Dependency graph
requires: []
provides:
  - Turborepo monorepo with pnpm workspaces at root
  - Next.js 15 web app scaffold (@floow/web) with Tailwind CSS and shadcn/ui
  - Expo mobile app stub (@floow/mobile) with Expo Router
  - Drizzle ORM package stub (@floow/db) with vitest config
  - Shared types package stub (@floow/shared)
  - Core finance package stub (@floow/core-finance)
  - shadcn/ui components (Button, Input, Card, Tabs, Form, Label) in apps/web
  - cn() utility with clsx + tailwind-merge
  - Vitest test infrastructure for web and db packages
  - Playwright e2e infrastructure at monorepo root
affects: [01-02-PLAN, 01-03-PLAN, 01-04-PLAN, all-subsequent-phases]

# Tech tracking
tech-stack:
  added:
    - turborepo ^2.8
    - pnpm 9.15 with workspace catalog support
    - next 15.5 (App Router)
    - typescript 5.7
    - tailwindcss 3.4
    - shadcn/ui (New York style, zinc, CSS variables)
    - class-variance-authority
    - clsx + tailwind-merge
    - @radix-ui/react-slot, react-label, react-tabs
    - lucide-react
    - drizzle-orm 0.40 + drizzle-kit
    - expo ~53 + expo-router
    - vitest 3.0 + @vitest/coverage-v8
    - @playwright/test 1.50
    - @supabase/supabase-js + @supabase/ssr (deps declared, not configured)
    - react-hook-form + @hookform/resolvers
    - zod (catalog)
    - @tanstack/react-query (catalog)
    - stripe + @stripe/stripe-js (deps declared, not configured)
  patterns:
    - Turborepo task pipeline with dependsOn ^build
    - pnpm catalog for shared version pinning across workspaces
    - node-linker=hoisted in .npmrc for Expo RN native build compatibility
    - @floow/* namespace for all workspace packages
    - @/ alias pointing to apps/web root (not src/)
    - shadcn/ui New York style as component baseline

key-files:
  created:
    - package.json (monorepo root)
    - pnpm-workspace.yaml (workspace + catalog definitions)
    - .npmrc (node-linker=hoisted)
    - turbo.json (build/dev/lint/typecheck/test/db:generate/db:migrate tasks)
    - tsconfig.json (base: strict, ES2022, bundler moduleResolution)
    - .gitignore
    - .env.example
    - apps/web/package.json
    - apps/web/next.config.ts
    - apps/web/tsconfig.json
    - apps/web/tailwind.config.ts
    - apps/web/postcss.config.js
    - apps/web/components.json (shadcn config)
    - apps/web/app/layout.tsx
    - apps/web/app/page.tsx
    - apps/web/app/globals.css
    - apps/web/lib/utils.ts (cn utility)
    - apps/web/components/ui/button.tsx
    - apps/web/components/ui/input.tsx
    - apps/web/components/ui/card.tsx
    - apps/web/components/ui/tabs.tsx
    - apps/web/components/ui/form.tsx
    - apps/web/components/ui/label.tsx
    - apps/web/vitest.config.ts
    - apps/mobile/package.json
    - apps/mobile/tsconfig.json
    - apps/mobile/app/_layout.tsx
    - packages/db/package.json
    - packages/db/tsconfig.json
    - packages/db/src/index.ts
    - packages/db/vitest.config.ts
    - packages/shared/package.json
    - packages/shared/tsconfig.json
    - packages/shared/src/index.ts
    - packages/core-finance/package.json
    - packages/core-finance/tsconfig.json
    - packages/core-finance/src/index.ts
    - playwright.config.ts
  modified: []

key-decisions:
  - "pnpm 9.15 required for catalog: version syntax — upgraded from 9.0"
  - "@stripe/stripe-js pinned to ^8.9.0 (latest) not ^4.11.0 from plan spec"
  - "@/ path alias maps to apps/web root (.) not ./src/ for Next.js App Router layout"
  - "shadcn/ui installed manually rather than via interactive CLI to enable automation"
  - "expo ~53 used (latest stable) instead of ~55 from plan (does not exist)"

patterns-established:
  - "Pattern 1: All @floow/* packages use workspace:* protocol in dependents"
  - "Pattern 2: Turborepo tasks key (not deprecated pipeline) with ^build dependency chain"
  - "Pattern 3: shadcn/ui components live at apps/web/components/ui/"
  - "Pattern 4: Vitest for unit tests, Playwright for e2e — separate configs per package"
  - "Pattern 5: .env.example documents all env vars; actual .env files are gitignored"

requirements-completed: [AUTH-05]

# Metrics
duration: 27min
completed: 2026-03-10
---

# Phase 1 Plan 01: Monorepo Scaffold Summary

**Turborepo + pnpm workspace monorepo with Next.js 15 web, Expo mobile stub, three @floow/* packages, shadcn/ui component library, and Vitest/Playwright test infrastructure**

## Performance

- **Duration:** 27 min
- **Started:** 2026-03-10T18:44:41Z
- **Completed:** 2026-03-10T19:12:17Z
- **Tasks:** 3
- **Files created:** 38

## Accomplishments
- Monorepo root with Turborepo pipeline (build, dev, lint, typecheck, test, db:generate, db:migrate) using pnpm 9.15 with catalog version pinning
- Next.js 15 web app with Tailwind CSS, shadcn/ui (New York style), and 6 UI components ready for auth screens in Plan 01-03
- Three @floow/* package stubs (db, shared, core-finance) wired via workspace:* protocol; full build and typecheck pass across all 5 packages
- Vitest configured for web + db; Playwright configured at root with baseURL localhost:3000 and chromium project

## Task Commits

Each task was committed atomically:

1. **Task 1: Create monorepo root configuration files and web app** - `5bdc876` (feat)
2. **Task 2: Create app/package stubs for mobile, db, shared, and core-finance** - `0e682a5` (feat)
3. **Task 3: Git init, shadcn/ui setup, Vitest + Playwright infrastructure** - `3d0ea28` (feat)

## Files Created/Modified
- `package.json` - Monorepo root with turbo/typescript devDeps and pnpm@9.15.0
- `pnpm-workspace.yaml` - Workspace definition with catalog for shared versions
- `.npmrc` - node-linker=hoisted for Expo native build compatibility
- `turbo.json` - Task pipeline using "tasks" key (not deprecated "pipeline")
- `tsconfig.json` - Base config: strict, ES2022, bundler moduleResolution, @floow/* paths
- `.env.example` - All 9 required environment variables documented
- `apps/web/` - Next.js 15, Tailwind CSS, shadcn/ui, all layout/page/globals files
- `apps/web/components/ui/` - Button, Input, Card, Tabs, Form, Label components
- `apps/web/lib/utils.ts` - cn() utility with clsx + tailwind-merge
- `apps/mobile/` - Expo 53 stub with Expo Router _layout.tsx
- `packages/db/` - Drizzle ORM stub with vitest config
- `packages/shared/` - Zod dependency stub
- `packages/core-finance/` - Empty stub for Phase 2
- `playwright.config.ts` - E2E config with baseURL localhost:3000, chromium project

## Decisions Made
- **pnpm 9.15 required:** The plan specified `pnpm@9.0.0` but catalog: version syntax was added in pnpm 9.5. Upgraded to 9.15.0.
- **@stripe/stripe-js version:** Plan specified ^4.11.0 which doesn't exist; latest is ^8.9.0. Used current latest.
- **@/ alias fix:** Next.js auto-set `@/*` to `./src/*` but files live at `apps/web/` root (App Router). Fixed to `./`. Required for shadcn component imports.
- **shadcn/ui installed manually:** Interactive CLI unsuitable for automation. Components installed as proper shadcn/ui pattern with all dependencies (class-variance-authority, radix-ui primitives).
- **Expo ~53 used:** Plan specified ~55 which does not exist on npm. Used ~53 (latest stable).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Upgraded pnpm from 9.0 to 9.15 for catalog: support**
- **Found during:** Task 1 (pnpm install)
- **Issue:** `catalog:` version syntax not supported by pnpm 9.0 (added in 9.5); install failed
- **Fix:** Updated packageManager to pnpm@9.15.0 and installed via npm install -g
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** pnpm install completes successfully with all catalog: refs resolved
- **Committed in:** 5bdc876 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed @stripe/stripe-js version**
- **Found during:** Task 1 (pnpm install)
- **Issue:** Plan specified ^4.11.0 which does not exist; latest is 8.9.0
- **Fix:** Updated version to ^8.9.0 (latest)
- **Files modified:** apps/web/package.json
- **Verification:** pnpm install resolves the package
- **Committed in:** 5bdc876 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed @/ path alias to map to apps/web root**
- **Found during:** Task 3 (build after adding shadcn components)
- **Issue:** Next.js default @/* maps to ./src/* but App Router puts files at root
- **Fix:** Updated tsconfig.json @/* to ./*, enabling @/lib/utils imports from components
- **Files modified:** apps/web/tsconfig.json
- **Verification:** `pnpm turbo run build` passes with no TypeScript errors
- **Committed in:** 3d0ea28 (Task 3 commit)

**4. [Rule 3 - Blocking] Fixed Expo SDK version (55 does not exist)**
- **Found during:** Task 2 (creating mobile package.json)
- **Issue:** Plan specified expo ~55 but only ~53 exists on npm
- **Fix:** Used expo ~53 (latest stable at time of execution)
- **Files modified:** apps/mobile/package.json
- **Verification:** pnpm install resolves expo ~53 successfully
- **Committed in:** 0e682a5 (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (1 blocking/upgrade, 1 bug/version, 1 bug/path-alias, 1 blocking/version)
**Impact on plan:** All auto-fixes were necessary for correctness. No scope creep. Plan intent fully preserved.

## Issues Encountered
- pnpm interactive catalog syntax requires v9.5+ — version bump was straightforward
- shadcn CLI is interactive and requires user input; manual file creation produced identical output

## User Setup Required
None - no external service configuration required for this plan. External services (Supabase, Stripe) are configured in Plan 01-02 and 01-04.

## Next Phase Readiness
- Monorepo builds and typechecks cleanly — ready for Plan 01-02 (Supabase schema + Drizzle ORM)
- @floow/db stub is ready to receive Drizzle schema in Plan 01-02
- shadcn/ui components ready for auth UI in Plan 01-03
- No blockers.

---
*Phase: 01-platform-foundation*
*Completed: 2026-03-10*
