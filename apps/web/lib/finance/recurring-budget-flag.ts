/**
 * Lê "Contar como meta de gasto" do FormData das actions de recorrente.
 *
 * Mora fora de recurring-actions.ts por causa do limite de 500 linhas, e fora
 * de um arquivo 'use server' porque é função síncrona.
 *
 * null quando o campo não veio — a edição parcial não mexe na flag.
 */
export function lerMetaDeGasto(formData: FormData): boolean | null {
  const valor = formData.get('countsAsBudget')
  if (valor === null) return null
  return valor === 'true'
}

/** Só despesa com categoria vira meta; o resto grava falso. */
export function metaDeGastoValida(pedida: boolean | null, type: string, categoryId: string | null): boolean {
  return pedida === true && type === 'expense' && !!categoryId
}
