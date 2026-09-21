/**
 * A marca de fluxo de caixa por lançamento: o que a linha mostra e o que o
 * clique faz.
 *
 * Módulo próprio, sem import nenhum, por duas razões: `cash-flow-actions.ts`
 * é `'use server'` e transformaria estas funções puras em actions async, e
 * `affects-cash-flow.ts` importa drizzle, o que arrastaria o driver para o
 * bundle do browser.
 *
 * Embaixo são três estados, porque "vazio" e "marcado no mesmo valor da
 * categoria" são coisas diferentes: no vazio, mudar a chave da categoria
 * arrasta o lançamento junto; marcado, ele fica parado — que é o ponto de ser
 * exceção.
 *
 * Em cima é uma resposta só: este lançamento entra no fluxo de caixa? Daí o
 * rótulo ser "no fluxo" / "fora do fluxo", com um ponto quando a decisão foi
 * tomada naquela linha. O rótulo anterior era "herda" / "fora" / "dentro", e
 * "herda" — o estado de 99% das linhas — não dizia nada sobre o que acontece
 * com aquele lançamento.
 */

/** A resposta que vale para o lançamento, somando linha e categoria. */
export function entraNoFluxo(
  doLancamento: boolean | null | undefined,
  daCategoria: boolean | null | undefined,
): boolean {
  if (doLancamento === true || doLancamento === false) return doLancamento
  // Sem nada em nenhum dos dois, conta — o mesmo default do
  // `coalesce(lancamento, categoria, true)` do SQL.
  return daCategoria !== false
}

/**
 * O próximo valor do ciclo, que o clique grava.
 *
 * O primeiro clique inverte a resposta que está na tela. Antes ia sempre para
 * `false`, então numa categoria que já não contava o clique não mudava nada
 * visível além de fazer aparecer um ponto.
 */
export function nextAffectsCashFlow(
  current: boolean | null | undefined,
  daCategoria?: boolean | null,
): boolean | null {
  const herdado = daCategoria !== false
  if (current === null || current === undefined) return !herdado
  if (current === !herdado) return herdado
  return null
}

export interface AffectsCashFlowState {
  label: string
  title: string
  /** Decisão tomada nesta linha, e não herdada da categoria — vira o ponto. */
  excecao: boolean
}

/** O que a UI mostra em cada estado. */
export function affectsCashFlowState(
  current: boolean | null | undefined,
  daCategoria?: boolean | null,
): AffectsCashFlowState {
  const dentro = entraNoFluxo(current, daCategoria)
  const label = dentro ? 'no fluxo' : 'fora do fluxo'
  const excecao = current === true || current === false

  if (!excecao) {
    return {
      label,
      title: dentro
        ? 'Entra no fluxo de caixa, seguindo a categoria. Clique para tirar só este lançamento.'
        : 'Fora do fluxo de caixa, seguindo a categoria. Clique para pôr só este lançamento.',
      excecao: false,
    }
  }

  return {
    label,
    title: dentro
      ? 'No fluxo de caixa por decisão só deste lançamento, mesmo que a categoria mude. Clique para trocar.'
      : 'Fora do fluxo de caixa por decisão só deste lançamento, mesmo que a categoria mude. Clique para trocar.',
    excecao: true,
  }
}
