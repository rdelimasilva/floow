/** Dinheiro em pt-BR: "1.500,00", "1500", "15,9". Ponto só como milhar. */
const DINHEIRO = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/
const SO_DIGITOS = /^\d+$/

/** `amount_cents` é integer; acima disto o valor não existe no banco (e o parâmetro estouraria). */
export const TETO_CENTAVOS = 2_000_000_000

/**
 * Como "Procurar previsão" lê o que a pessoa digitou (spec §2.4). Fora de
 * arquivo 'use server', que só pode exportar funções assíncronas.
 *
 * - Parece dinheiro com separador → busca só pelo valor (`texto: null`).
 * - Só dígitos ("2024", "99") → pode ser valor ou parte da descrição: as duas.
 * - O resto ("12.34", "1e5", "aluguel") → só na descrição. `Number()` sozinho
 *   aceitava "1e5" e "Infinity" e lia "12.34" como 1234.
 */
export function interpretarTermo(termo: string): { centavos: number | null; texto: string | null } {
  const t = termo.trim()
  if (!DINHEIRO.test(t)) return { centavos: null, texto: t }
  const centavos = Math.round(Number(t.replace(/\./g, '').replace(',', '.')) * 100)
  const valido = centavos > 0 && centavos <= TETO_CENTAVOS
  if (!valido) return { centavos: null, texto: t }
  return { centavos, texto: SO_DIGITOS.test(t) ? t : null }
}
