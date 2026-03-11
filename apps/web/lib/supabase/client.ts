import { createBrowserClient } from '@supabase/ssr'
import { assertEnv } from '@floow/shared'

export function createClient() {
  return createBrowserClient(
    assertEnv('NEXT_PUBLIC_SUPABASE_URL'),
    assertEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  )
}
