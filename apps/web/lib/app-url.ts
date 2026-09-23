/**
 * URL pública do app, para montar links absolutos no servidor (e-mail, retorno
 * do checkout do Stripe, disparo interno do CFO).
 *
 * Só servidor — por isso `APP_URL` e não `NEXT_PUBLIC_APP_URL`. Sem a variável,
 * usa `VERCEL_PROJECT_PRODUCTION_URL`, que a Vercel injeta sozinha (sem
 * protocolo). Antes disto, a ausência de NEXT_PUBLIC_APP_URL em produção fazia
 * tudo apontar para localhost sem aviso.
 */
type Env = Partial<Record<'APP_URL' | 'VERCEL_PROJECT_PRODUCTION_URL', string>>

export function getAppUrl(env: Env = process.env as Env): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, '')
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:3000'
}
