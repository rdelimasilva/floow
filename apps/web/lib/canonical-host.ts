/**
 * Endereços antigos do app que devem levar ao domínio oficial.
 *
 * O painel da Vercel não deixa redirecionar o `<projeto>.vercel.app`, então o
 * desvio é feito aqui. `/api` fica de fora: cron da Vercel e webhooks não
 * seguem redirect, e um 308 faria a chamada falhar em silêncio.
 */
const CANONICAL_ORIGIN = 'https://app.floowapp.com.br'
const LEGACY_HOSTS = new Set(['floow-web.vercel.app'])

export function canonicalRedirect(url: URL): string | null {
  if (!LEGACY_HOSTS.has(url.host)) return null
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return null
  return CANONICAL_ORIGIN + url.pathname + url.search
}
