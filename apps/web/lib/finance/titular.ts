/**
 * O titular é só o primeiro nome: é o rótulo do filtro por pessoa, e o nome
 * completo não ajudaria a escolher entre cinco pessoas da mesma família.
 * Vazio vira null, a conta sem titular.
 */
export function primeiroNome(valor: string | null | undefined): string | null {
  const nome = valor?.trim().split(/\s+/)[0]?.slice(0, 30)
  return nome ? nome : null
}
