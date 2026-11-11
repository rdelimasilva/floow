import { ehIdDeRota } from '@/lib/investments/id-de-rota'

/** `?accountId=a,b` da URL só com ids válidos; vem do usuário e volta para uma URL. */
export function contaDaUrl(bruto: string | null | undefined): string {
  return (bruto ?? '').split(',').filter(ehIdDeRota).join(',')
}

/** Acrescenta a conta escolhida a um link de Investimentos. Sem conta, devolve o link como veio. */
export function comConta(href: string, accountId: string | null | undefined): string {
  const conta = contaDaUrl(accountId)
  if (!conta) return href
  return `${href}${href.includes('?') ? '&' : '?'}accountId=${encodeURIComponent(conta)}`
}
