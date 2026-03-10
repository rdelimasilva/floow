// These tests require Supabase running. For e2e, see playwright tests.
import { describe, it } from 'vitest'

describe('Auth flows', () => {
  it.todo('email/password signup creates user and sends verification email') // AUTH-01
  it.todo('email/password signup redirects to verify-email page') // AUTH-02
  it.todo('magic link login sends OTP email') // AUTH-03
  it.todo('session persists across page refresh') // AUTH-06
})
