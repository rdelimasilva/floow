import { describe, it, expect } from 'vitest'
import { getAppUrl } from '@/lib/app-url'

describe('getAppUrl', () => {
  it('APP_URL tem prioridade e perde a barra final', () => {
    expect(getAppUrl({ APP_URL: 'https://x.com.br/', VERCEL_PROJECT_PRODUCTION_URL: 'y.vercel.app' })).toBe(
      'https://x.com.br',
    )
  })

  it('sem APP_URL, usa o domínio de produção que a Vercel injeta (vem sem protocolo)', () => {
    expect(getAppUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'floow-web.vercel.app' })).toBe(
      'https://floow-web.vercel.app',
    )
  })

  it('sem nada, cai no localhost do dev', () => {
    expect(getAppUrl({})).toBe('http://localhost:3000')
  })
})
