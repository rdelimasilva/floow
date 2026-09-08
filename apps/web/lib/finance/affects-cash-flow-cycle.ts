/**
 * O ciclo de três estados da exceção de fluxo de caixa por lançamento.
 *
 * Módulo próprio, sem import nenhum, por duas razões: `cash-flow-actions.ts`
 * é `'use server'` e transformaria esta função pura em action async, e
 * `affects-cash-flow.ts` importa drizzle, o que arrastaria o driver para o
 * bundle do browser.
 *
 * `null` significa "herda da categoria" e é diferente de "explicitamente
 * dentro do fluxo": enquanto está `null`, mudar o checkbox da categoria
 * arrasta o lançamento junto; com valor explícito ele fica parado, que é o
 * ponto de ser exceção.
 *
 * A ordem começa pelo que o usuário quer na maioria dos casos — tirar aquele
 * lançamento do fluxo — então o caso comum custa um clique. "Explicitamente
 * dentro" é o estado raro e vem por último.
 */
export function nextAffectsCashFlow(current: boolean | null | undefined): boolean | null {
  if (current === null || current === undefined) return false
  if (current === false) return true
  return null
}

export interface AffectsCashFlowState {
  label: string
  title: string
}

/** O que a UI mostra em cada estado. */
export function affectsCashFlowState(current: boolean | null | undefined): AffectsCashFlowState {
  if (current === null || current === undefined) {
    return {
      label: 'herda',
      title: 'Fluxo de caixa: segue a categoria. Clique para tirar este lançamento do fluxo.',
    }
  }
  if (current === false) {
    return {
      label: 'fora',
      title: 'Fora do fluxo de caixa. Clique para forçar a entrada no fluxo.',
    }
  }
  return {
    label: 'dentro',
    title: 'Sempre no fluxo de caixa, mesmo que a categoria mude. Clique para voltar a herdar.',
  }
}
