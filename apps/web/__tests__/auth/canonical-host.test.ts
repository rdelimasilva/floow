import { describe, it, expect } from 'vitest'
import { canonicalRedirect } from '@/lib/canonical-host'

const url = (s: string) => new URL(s)

describe('canonicalRedirect', () => {
  it('floow-web.vercel.app vai para app.floowapp.com.br mantendo caminho e query', () => {
    expect(canonicalRedirect(url('https://floow-web.vercel.app/auth?next=%2Faccounts'))).toBe(
      'https://app.floowapp.com.br/auth?next=%2Faccounts',
    )
  })

  it('/api fica no host original: cron e webhook não seguem redirect', () => {
    expect(canonicalRedirect(url('https://floow-web.vercel.app/api/cfo/run-daily'))).toBeNull()
  })

  it('o domínio oficial, os deploys de preview e o localhost não mudam', () => {
    expect(canonicalRedirect(url('https://app.floowapp.com.br/dashboard'))).toBeNull()
    expect(canonicalRedirect(url('https://floow-abc123-rdelimasilvas-projects.vercel.app/auth'))).toBeNull()
    expect(canonicalRedirect(url('http://localhost:3000/auth'))).toBeNull()
  })
})
