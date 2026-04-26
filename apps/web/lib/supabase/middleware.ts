import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      `Supabase env vars missing at runtime: NEXT_PUBLIC_SUPABASE_URL=${url ? 'set' : 'EMPTY'}, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key ? 'set' : 'EMPTY'}. Check Vercel project Environment Variables and rebuild.`,
    )
  }

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession() validates JWT locally from cookies — no network round-trip.
  // This is safe for route protection since the JWT signature is verified locally.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user ?? null

  return { supabaseResponse, user }
}
