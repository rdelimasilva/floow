import { cache } from 'react'
import { createClient } from './server'

/**
 * Cached getUser() — deduplicates Supabase auth calls within the same
 * React Server Component request. Middleware already validates JWT, so
 * this avoids redundant network round-trips to Supabase per navigation.
 */
export const getUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null
  return user
})
