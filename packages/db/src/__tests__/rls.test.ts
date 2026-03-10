// These tests require a running Supabase instance. Run: supabase start && pnpm --filter @floow/db test
// Wave 0 stubs for AUTH-05: Multi-tenant org isolation with RLS
import { describe, it } from 'vitest'

describe('RLS policies', () => {
  it.todo('user can only read orgs they belong to')
  it.todo('user cannot read another org\'s subscriptions')
  it.todo('user can only update their own profile')
  it.todo('org_members are scoped by org membership')
})
