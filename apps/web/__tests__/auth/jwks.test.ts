import { describe, expect, it } from 'vitest'
import { JWKS_DO_AUTH } from '@/lib/supabase/jwks'

describe('JWKS_DO_AUTH', () => {
  it('importa como chave de verificação ES256 — o mesmo passo que o getClaims faz', async () => {
    for (const jwk of JWKS_DO_AUTH.keys) {
      const chave = await crypto.subtle.importKey(
        'jwk',
        jwk as JsonWebKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['verify'],
      )
      expect(chave.usages).toEqual(['verify'])
    }
  })
})
