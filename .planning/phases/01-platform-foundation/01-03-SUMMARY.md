---
phase: 01-platform-foundation
plan: 03
subsystem: auth
tags: [supabase, ssr, next-js, react-hook-form, zod, expo, react-native, oauth, magic-link, middleware, cookie-auth]

# Dependency graph
requires:
  - 01-01 (monorepo scaffold, @floow/web, @floow/mobile, @floow/shared stubs, shadcn/ui components)
  - 01-02 (Drizzle schema, on_auth_user_created trigger, custom_access_token_hook, get_user_org_ids RLS helper)
provides:
  - Browser and server Supabase client factories (createBrowserClient/createServerClient via @supabase/ssr)
  - Middleware for cookie-based token refresh and route protection (updateSession helper)
  - OAuth/magic link PKCE callback handler at /auth/callback
  - Auth page at /auth with Login/Signup tabs — Google, Apple, email/password, magic link as peer options
  - Email verification screen at /auth/verify-email
  - Protected app shell at /dashboard with server-side auth gate and sign-out
  - Shared Zod schemas: loginSchema, signupSchema, magicLinkSchema exported from @floow/shared
  - Mobile Supabase client with AsyncStorage session persistence
  - Wave 0 auth integration test stubs for AUTH-01, AUTH-02, AUTH-03, AUTH-06
affects: [01-04-PLAN, all-subsequent-phases, all-features-behind-auth-gate]

# Tech tracking
tech-stack:
  added:
    - "@supabase/ssr createBrowserClient — browser Supabase client with cookie-based auth"
    - "@supabase/ssr createServerClient — server Supabase client for SSR/RSC/middleware"
    - "react-hook-form with zodResolver — form state management for auth forms"
    - "@hookform/resolvers/zod — connects Zod schemas to react-hook-form validation"
    - "react-native-url-polyfill — URL polyfill required for Supabase in React Native"
    - "@react-native-async-storage/async-storage — session storage for mobile Supabase client"
  patterns:
    - "Supabase client instantiated inside event handlers, never at module/component level — avoids SSR/build-time errors when env vars are absent"
    - "updateSession(request) middleware helper — extracts Supabase client creation + token refresh into reusable function"
    - "Belt-and-suspenders auth protection — middleware redirects + server component auth check in app layout"
    - "CRITICAL: getUser() not getSession() on server — getSession() does not validate JWT"
    - "OAuth/magic link callback uses NextResponse.redirect, never Link components (avoids Pitfall 5: prefetch before cookie write)"
    - "Auth forms use shared Zod schemas from @floow/shared — single validation source for web and mobile"

key-files:
  created:
    - apps/web/lib/supabase/client.ts
    - apps/web/lib/supabase/server.ts
    - apps/web/lib/supabase/middleware.ts
    - apps/web/middleware.ts
    - apps/web/app/(auth)/layout.tsx
    - apps/web/app/(auth)/auth/page.tsx
    - apps/web/app/(auth)/auth/verify-email/page.tsx
    - apps/web/app/(auth)/auth/callback/route.ts
    - apps/web/app/(app)/layout.tsx
    - apps/web/app/(app)/dashboard/page.tsx
    - apps/web/components/auth/auth-tabs.tsx
    - apps/web/components/auth/login-form.tsx
    - apps/web/components/auth/signup-form.tsx
    - apps/web/components/auth/magic-link-form.tsx
    - apps/web/components/auth/oauth-buttons.tsx
    - apps/web/components/auth/sign-out-button.tsx
    - packages/shared/src/schemas/auth.ts
    - apps/mobile/lib/supabase/client.ts
    - apps/mobile/app/(auth)/login.tsx
    - apps/mobile/app/(app)/_layout.tsx
    - apps/mobile/app/(app)/index.tsx
    - apps/web/__tests__/auth/signup.test.ts
  modified:
    - packages/shared/src/index.ts (added re-export of schemas/auth)

key-decisions:
  - "Supabase client instantiated inside event handlers, not at component level — avoids build-time errors when NEXT_PUBLIC_SUPABASE_URL is unset during static prerendering"
  - "SignOutButton extracted as separate client component — app layout is a Server Component and cannot use hooks directly"
  - "Magic link and OAuth skip email verification (LOCKED DECISION) — redirectTo set to /auth/callback for PKCE exchange"
  - "All auth methods presented as peer options in tabs (LOCKED DECISION) — no method is secondary"

patterns-established:
  - "Pattern: Supabase event-handler-scoped client — createClient() called inside async handlers, not at module level"
  - "Pattern: Server component auth gate — createClient() + getUser() in layout, redirect if no user"
  - "Pattern: Middleware updateSession helper — extracts middleware Supabase setup for reuse"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-06]

# Metrics
duration: 6min
completed: 2026-03-10
---

# Phase 1 Plan 03: Authentication Flows Summary

**Cookie-based multi-method auth with @supabase/ssr — email/password, magic link, Google/Apple OAuth, PKCE callback, route protection middleware, and protected dashboard shell**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-10T20:04:19Z
- **Completed:** 2026-03-10T20:10:30Z
- **Tasks:** 3 of 4 complete (Task 4 is a human-verify checkpoint — awaiting verification)
- **Files created:** 22
- **Files modified:** 1

## Accomplishments

- Complete auth system: email/password signup with email verification gate, magic link OTP, Google/Apple OAuth via PKCE callback — all methods presented as peer options per locked decision
- Cookie-based session with middleware token refresh (updateSession helper) and belt-and-suspenders protection in app layout server component
- Shared Zod schemas (loginSchema, signupSchema, magicLinkSchema) in @floow/shared used by all auth forms via react-hook-form + zodResolver
- Protected dashboard shell with server-side user fetch, org context from JWT app_metadata, and sign-out button
- Mobile Supabase client with AsyncStorage and React Native URL polyfill
- Wave 0 auth test stubs at apps/web/__tests__/auth/signup.test.ts for AUTH-01/02/03/06

## Task Commits

Each task was committed atomically:

1. **Task 1: Supabase clients, middleware, auth callback, shared schemas, and Wave 0 auth test stub** - `24b627d` (feat)
2. **Task 2: Auth page UI — auth components (login, signup, magic link, OAuth)** - `f133314` (feat)
3. **Task 3: Protected app shell, dashboard, and mobile stubs** - `4b9d5eb` (feat)

Task 4 (human-verify checkpoint) — awaiting user verification.

## Files Created/Modified

- `apps/web/lib/supabase/client.ts` - createBrowserClient factory for browser/client components
- `apps/web/lib/supabase/server.ts` - createServerClient factory for SSR/Server Components
- `apps/web/lib/supabase/middleware.ts` - updateSession(request) helper for middleware token refresh
- `apps/web/middleware.ts` - Route protection: unauthenticated → /auth, authenticated on /auth → /dashboard
- `apps/web/app/(auth)/layout.tsx` - Minimal centered white layout (Linear/Vercel style)
- `apps/web/app/(auth)/auth/page.tsx` - Auth page rendering AuthTabs
- `apps/web/app/(auth)/auth/verify-email/page.tsx` - "Check your email" screen
- `apps/web/app/(auth)/auth/callback/route.ts` - PKCE code exchange for OAuth and magic link
- `apps/web/app/(app)/layout.tsx` - Server component app shell with auth gate and header
- `apps/web/app/(app)/dashboard/page.tsx` - Protected dashboard with org context
- `apps/web/components/auth/auth-tabs.tsx` - Login/Signup tabs with all auth methods
- `apps/web/components/auth/login-form.tsx` - Email/password login with RHF + zodResolver
- `apps/web/components/auth/signup-form.tsx` - Signup form redirecting to /auth/verify-email
- `apps/web/components/auth/magic-link-form.tsx` - Magic link OTP form
- `apps/web/components/auth/oauth-buttons.tsx` - Google and Apple OAuth buttons
- `apps/web/components/auth/sign-out-button.tsx` - Client component sign-out button
- `packages/shared/src/schemas/auth.ts` - loginSchema, signupSchema, magicLinkSchema + inferred types
- `packages/shared/src/index.ts` - Re-exports schemas/auth
- `apps/mobile/lib/supabase/client.ts` - Mobile Supabase client with AsyncStorage
- `apps/mobile/app/(auth)/login.tsx` - Mobile login stub with Supabase client wiring proof
- `apps/mobile/app/(app)/_layout.tsx` - Mobile Stack navigator
- `apps/mobile/app/(app)/index.tsx` - Mobile dashboard placeholder
- `apps/web/__tests__/auth/signup.test.ts` - Wave 0 auth test stubs (AUTH-01/02/03/06)

## Decisions Made

- **Supabase client instantiated inside event handlers:** `createClient()` called inside async handlers (not at module/component level) to avoid build-time errors when env vars are absent during static prerendering. Next.js 15 calls `createBrowserClient(url!, key!)` at module evaluation time, which throws when env vars are not set. Moving to event handlers means the call only happens in the browser where env vars are populated.
- **SignOutButton as separate client component:** The `(app)/layout.tsx` is a Server Component. Sign-out requires calling `supabase.auth.signOut()` which is a client-side operation. Extracted into `sign-out-button.tsx` with `'use client'` directive.
- **Magic link emailRedirectTo uses /auth/callback:** Consistent with OAuth redirect — all auth methods land at the same PKCE exchange handler.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Moved Supabase client instantiation from component level to event handlers**
- **Found during:** Task 2 (build verification)
- **Issue:** Original auth components called `createClient()` at the component function body level. During Next.js static prerendering, this caused `@supabase/ssr: Your project's URL and API key are required` because env vars are not set at build time. Build exited with code 1.
- **Fix:** Moved `const supabase = createClient()` from component body into each async event handler (`onSubmit`, `handleSignIn`, `signInWithGoogle`, `signInWithApple`). The browser client is only created when a user action fires, at which point env vars are available from the browser window.
- **Files modified:** `components/auth/oauth-buttons.tsx`, `components/auth/login-form.tsx`, `components/auth/signup-form.tsx`, `components/auth/magic-link-form.tsx`
- **Verification:** `pnpm turbo run build --filter=@floow/web` passes — all 8 routes render
- **Committed in:** f133314 (Task 2 commit, bug was found and fixed during same task)

**2. [Rule 2 - Missing Critical] Added SignOutButton client component not in original plan**
- **Found during:** Task 3 (app layout implementation)
- **Issue:** App layout is a Server Component. Sign-out requires `supabase.auth.signOut()` which needs a browser client and router. The plan specified a "Sign out" button but didn't account for the Server Component constraint.
- **Fix:** Created `components/auth/sign-out-button.tsx` as `'use client'` component with `useRouter` hook and browser Supabase client call.
- **Files modified:** `apps/web/components/auth/sign-out-button.tsx` (created)
- **Verification:** App layout compiles and builds successfully
- **Committed in:** 4b9d5eb (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both auto-fixes necessary for correctness. The Supabase client placement fix is an essential pattern for all auth components in Next.js App Router. SignOutButton is a required structural separation for Server/Client component boundary.

## Issues Encountered

- Next.js 15 static prerender calls `createBrowserClient()` during module evaluation even for `'use client'` components when generating the static shell. This is expected behavior — client components still need to provide a static shell. The fix (event-handler-scoped client creation) is now an established pattern for this codebase.

## User Setup Required

The following Supabase configuration is required before auth flows work end-to-end. These are documented here for the human verification step (Task 4 checkpoint):

**Environment variables required (apps/web/.env.local):**
```
NEXT_PUBLIC_SUPABASE_URL=<from Supabase Dashboard -> Settings -> API -> Project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<from Supabase Dashboard -> Settings -> API -> anon public key>
SUPABASE_SERVICE_ROLE_KEY=<from Supabase Dashboard -> Settings -> API -> service_role key>
DATABASE_URL=<from Supabase Dashboard -> Settings -> Database -> Connection string>
```

**Supabase Dashboard configuration:**
- Enable Google OAuth provider (Authentication -> Providers -> Google)
- Enable Apple OAuth provider (Authentication -> Providers -> Apple)
- Set Site URL to http://localhost:3000 (Authentication -> URL Configuration)
- Add redirect URL: http://localhost:3000/auth/callback (Authentication -> URL Configuration)
- Enable custom_access_token_hook (Authentication -> Hooks)
- Apply migration: `supabase db reset` (applies 00001_foundation.sql with trigger + RLS)

## Next Phase Readiness

- Auth system complete pending Supabase env var configuration — all code is in place
- Shared Zod schemas ready for mobile auth implementation in future plans
- Mobile stubs ready for full auth UI in mobile-focused plan
- Wave 0 auth test stubs in place for AUTH-01/02/03/06 (require live Supabase for full e2e)
- No code blockers — awaiting Task 4 human verification before marking plan complete

## Self-Check: PASSED

All key files verified present on disk:
- apps/web/lib/supabase/client.ts — FOUND
- apps/web/lib/supabase/server.ts — FOUND
- apps/web/middleware.ts — FOUND
- apps/web/app/(auth)/auth/page.tsx — FOUND
- apps/web/app/(auth)/auth/verify-email/page.tsx — FOUND
- apps/web/app/(auth)/auth/callback/route.ts — FOUND
- apps/web/app/(app)/dashboard/page.tsx — FOUND
- packages/shared/src/schemas/auth.ts — FOUND
- apps/web/__tests__/auth/signup.test.ts — FOUND
- apps/mobile/lib/supabase/client.ts — FOUND

All commits verified:
- 24b627d (Task 1) — FOUND
- f133314 (Task 2) — FOUND
- 4b9d5eb (Task 3) — FOUND

---
*Phase: 01-platform-foundation*
*Completed: 2026-03-10*
