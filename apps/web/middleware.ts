import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Public routes that do NOT require authentication.
// Protect all routes by default — only explicitly listed paths are accessible without auth.
const publicRoutes = ['/auth', '/api/webhooks', '/api/cfo/run-daily', '/api/cfo/run-event']

function isPublicRoute(pathname: string): boolean {
  if (pathname === '/') return true
  return publicRoutes.some((prefix) => pathname.startsWith(prefix))
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)

  const pathname = request.nextUrl.pathname

  // Redirect unauthenticated users to /auth for any non-public route.
  // This covers /dashboard, /billing, and any future route under (app)/ automatically.
  if (!user && !isPublicRoute(pathname)) {
    return NextResponse.redirect(new URL('/auth', request.url))
  }

  // Redirect authenticated users away from /auth to /dashboard
  if (user && pathname === '/auth') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - api/webhooks (webhooks must not require auth)
     * - api/reconcile (background reconcile endpoint, auth enforced internally)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/reconcile|api/cfo/run-).*)',
  ],
}
