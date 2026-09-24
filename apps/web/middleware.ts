import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Next.js middleware — runs on every matched request before the page renders.
 *
 * Responsibilities:
 *  1. Refresh the Supabase session token so server-side clients always get a
 *     valid, non-expired JWT from cookies (required by @supabase/ssr).
 *  2. Redirect unauthenticated users away from protected routes to /auth.
 *  3. Redirect already-authenticated users away from /auth back to /dashboard.
 *
 * Public routes listed below are accessible without authentication.
 * All other routes are protected by default.
 */

const PUBLIC_ROUTE_PREFIXES = [
  '/auth',
  '/privacidade',        // Política de privacidade — exigida pelo OAuth do Google
  '/api/webhooks',       // Stripe — uses signature-based auth
  '/api/cfo/run-daily',  // Cron job — uses CRON_SECRET / SERVICE_ROLE_KEY
  '/api/cfo/run-event',  // Event trigger — uses SERVICE_ROLE_KEY
  '/api/reconcile',      // Background job — auth enforced internally
  '/api/openfinance/import-transactions', // Cron 3x/dia — usa CRON_SECRET / SERVICE_ROLE_KEY
  '/api/email/unsubscribe', // Link do rodapé do e-mail — autoriza pelo token assinado
]

function isPublicRoute(pathname: string): boolean {
  if (pathname === '/') return true
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, userId } = await updateSession(request)

  const { pathname } = request.nextUrl

  // Not authenticated → redirect to /auth, preserving intended destination
  if (!userId && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Already authenticated → bounce away from /auth to the app
  if (userId && pathname === '/auth') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     *  - _next/static  (static assets)
     *  - _next/image   (image optimisation)
     *  - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
}
