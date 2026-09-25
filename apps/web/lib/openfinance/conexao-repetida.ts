/**
 * Uma segunda conexão com o mesmo CPF e o mesmo banco só entra se não repetir
 * produto de uma conexão viva.
 *
 * O produto de um consentimento não muda depois de autorizado: quem conectou
 * conta e cartão e quer os investimentos precisa de outro consentimento.
 * Refazer o primeiro reimportaria o extrato inteiro. Repetir produto, por
 * outro lado, é o caso que o teto regulatório por CPF pune — e importaria o
 * mesmo extrato duas vezes.
 */
export function produtosJaConectados(
  existentes: { products: string[] | null }[],
  pedidos: string[],
): string[] {
  // Sem produtos gravados não há como saber o que a conexão cobre: conta
  // como tudo, e a regra antiga (uma conexão por banco) vale.
  if (existentes.some((c) => c.products == null)) return [...pedidos]
  const cobertos = new Set(existentes.flatMap((c) => c.products ?? []))
  return pedidos.filter((p) => cobertos.has(p))
}
