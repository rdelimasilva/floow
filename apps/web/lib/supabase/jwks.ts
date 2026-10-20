import type { JWK } from '@supabase/supabase-js'

/**
 * A chave PÚBLICA que o Auth do Supabase usa para assinar o JWT
 * (`/auth/v1/.well-known/jwks.json` do projeto).
 *
 * Sem ela, `getClaims()` busca o JWKS na rede e guarda só por 10 minutos por
 * instância: a cada vencimento, a requisição que cai ali espera ~130–180 ms
 * (no Sentry, em série antes de qualquer consulta do Dashboard) — no
 * middleware e de novo na página.
 *
 * Passada em `getClaims(undefined, { jwks })`, a assinatura continua sendo
 * verificada, só que contra esta chave. Se o Supabase rotacionar a chave, o
 * `kid` novo não bate aqui e o `getClaims` volta a buscar na rede: fica lento
 * de novo, não quebra. Ao rotacionar, copie o JWKS novo para cá.
 */
export const JWKS_DO_AUTH: { keys: JWK[] } = {
  keys: [
    {
      alg: 'ES256',
      crv: 'P-256',
      ext: true,
      key_ops: ['verify'],
      kid: '8830e5f1-eafd-4243-be8a-6a5e0f39aad7',
      kty: 'EC',
      use: 'sig',
      x: 'ZjVMfpu-hepMh-bPl31zoCxScQ_8rWjlqBjsZFelo2U',
      y: 'mydkUxUtBTj3BCPiilkM39HsuzKnkEQXEaoaLNijER4',
    },
  ],
}
