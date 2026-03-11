import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { assertEnv } from '@floow/shared'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    assertEnv('NEXT_PUBLIC_SUPABASE_URL'),
    assertEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — middleware handles refresh
          }
        },
      },
    }
  )
}
