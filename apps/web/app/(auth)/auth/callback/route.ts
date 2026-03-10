import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // CRITICAL: Do NOT use Link components here — prefetching can fire before
      // cookie is written (Pitfall 5). Use programmatic redirect only.
      return NextResponse.redirect(new URL('/dashboard', origin))
    }
  }

  // On error: redirect back to auth page with error param
  return NextResponse.redirect(new URL('/auth?error=auth_callback_failed', origin))
}
