/** Faixa de anos aceita nos campos de data: pega o dígito a mais ("20226"). */
export const ANO_MINIMO = 1900
export const ANO_MAXIMO = 2100

export function dataPlausivel(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return false
  const ano = Number(m[1])
  return ano >= ANO_MINIMO && ano <= ANO_MAXIMO && !Number.isNaN(new Date(iso).getTime())
}

/** Aviso (não erro) para data depois de hoje: pode ser de propósito, pode ser engano. */
export function avisoDeDataFutura(iso: string, hoje: string): string | null {
  if (!iso || iso <= hoje) return null
  return 'Data no futuro — confira se é isso mesmo.'
}
