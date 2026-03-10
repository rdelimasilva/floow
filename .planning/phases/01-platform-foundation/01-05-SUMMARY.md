---
phase: 01-platform-foundation
plan: 05
subsystem: auth
tags: [nextjs, middleware, supabase, route-protection]

# Dependency graph
requires:
  - phase: 01-platform-foundation/01-03
    provides: Supabase auth integration and middleware updateSession helper
  - phase: 01-platform-foundation/01-04
    provides: /billing route that was not middleware-protected due to the bug
provides:
  - Inversion-based middleware route protection — all routes protected by default, only public paths exempted
  - isPublicRoute() helper function as allowlist pattern for future route additions
affects:
  - Phase 2 and beyond — all new routes under (app)/ are automatically protected without code changes

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Inversion-based route protection — allowlist public routes rather than blocklist protected routes

key-files:
  created: []
  modified:
    - apps/web/middleware.ts

key-decisions:
  - "Inversion-based middleware protection: allowlist public routes (/auth, /api/webhooks, /) instead of blocklisting protected routes — ensures any future route is automatically protected without code changes"

patterns-established:
  - "Middleware inversion pattern: define publicRoutes array and isPublicRoute() helper; protect !isPublicRoute(pathname) — eliminates class of bugs where newly added routes are unprotected"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, BILL-01, BILL-02, BILL-03]

# Metrics
duration: 1min
completed: 2026-03-10
---

# Phase 01 Plan 05: Middleware Route Protection Gap Closure Summary

**Inversion-based Next.js middleware that protects all routes by default using a public-route allowlist, closing the gap where /billing was unprotected due to dead pathname.startsWith('/(app)') check**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-10T23:13:42Z
- **Completed:** 2026-03-10T23:14:19Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Removed dead `pathname.startsWith('/(app)')` condition — Next.js route groups are URL-transparent so this never matched
- Introduced `isPublicRoute()` helper using an allowlist (`/auth`, `/api/webhooks`, `/`) — all other paths are protected by default
- `/billing`, `/dashboard`, and any future route under the `(app)/` route group are now automatically middleware-protected without needing to enumerate them
- TypeScript compiles without errors, matcher config unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace dead route group check with inversion-based protection** - `00961b8` (fix)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `apps/web/middleware.ts` - Replaced dead route group check with isPublicRoute() inversion pattern

## Decisions Made
- Inversion-based protection chosen over listing protected routes — future-proof; new routes are automatically protected without code changes. isPublicRoute() allowlist is the single source of truth for public access.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Middleware now correctly protects all app routes including /billing
- The inversion pattern means Phase 2 routes will be automatically protected without middleware changes
- No blockers for Phase 2

---
*Phase: 01-platform-foundation*
*Completed: 2026-03-10*
