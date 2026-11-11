export type ViewMode = 'realized' | 'projected' | 'both'

/**
 * Visão com que Análises abre. Recorte escolhido em outra tela não pode deixar
 * a tela vazia (hoje conta como presente): período todo no futuro só tem previsão, e período todo no
 * passado não tem previsão. "Ambos" nunca é trocado: serve aos dois.
 */
export function visaoInicial(pref: ViewMode, startDate: string, endDate: string, hoje: string): ViewMode {
  if (pref === 'both') return pref
  if (startDate && startDate > hoje) return 'projected'
  if (pref === 'projected' && endDate && endDate < hoje) return 'realized'
  return pref
}
