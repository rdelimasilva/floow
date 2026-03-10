import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)

  const pathname = request.nextUrl.pathname

  // Protect app routes — redirect unauthenticated users to /auth
  if (
    !user &&
    (pathname.startsWith('/(app)') || pathname.startsWith('/dashboard'))
  ) {
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
     */
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)',
  ],
}
