/** Minúsculas e sem acento: "São João" e "sao joao" viram a mesma coisa. */
function dobrar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Filtra "Já confirmadas" pelo nome da regra e pela conta de destino. Com
 * dezenas de regras, achar uma rolando a lista não funciona; digitar "xp"
 * mostra tudo o que vai para a XP.
 */
export function filtrarRegras<T extends { displayName: string; transferAccountName: string | null }>(
  regras: T[],
  termo: string,
): T[] {
  const busca = dobrar(termo.trim())
  if (!busca) return regras
  return regras.filter((r) => dobrar(`${r.displayName} ${r.transferAccountName ?? ''}`).includes(busca))
}
