import type { NormalizedPolpTransaction } from '@floow/core-finance'

/**
 * Regras que decidem a NATUREZA de uma transação importada.
 *
 * Só o usuário sabe que "Débito automático PERS BLACK" é o pagamento da fatura
 * do cartão dele. O app pode suspeitar — ver `nature-suspects.ts` — e nunca
 * afirmar: inferir sozinho e aplicar é o erro que a decisão D5 da spec de
 * ingestão evitou, e aqui o dano seria maior, porque natureza errada dobra ou
 * apaga um mês inteiro de gasto no orçamento.
 *
 * Esta camada vive fora do normalizador de propósito. `normalize.ts` é puro e
 * determinístico e não sabe que regras de usuário existem — é essa fronteira
 * que o mantém testável sem banco.
 *
 * Ver docs/superpowers/specs/2026-09-03-openfinance-nature-reclassification-design.md
 */

export type TransactionNature = 'income' | 'expense' | 'transfer'

export interface NatureRule {
  id: string
  /** Null = vale para a org inteira. Preenchido = só naquela conta. */
  accountId: string | null
  matchType: 'contains' | 'exact'
  matchValue: string
  nature: TransactionNature
  priority: number
  isEnabled: boolean
  createdAt: Date
}

/**
 * Forma canônica dos dois lados da comparação: sem acento, sem caixa, sem
 * espaço sobrando.
 *
 * "Aplicação" e "APLICACAO" são a mesma coisa para quem escreveu a regra, e o
 * banco manda uma ou outra sem avisar.
 */
export function foldForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Filtra e ordena as regras: desligadas fora, vazias fora, e a ordem em que
 * competem.
 *
 * A ordem é conta específica primeiro, depois `priority` maior, depois mais
 * recente. Quem escreveu "toda 'aplicação' NESTA conta é transferência" foi
 * mais específico que quem escreveu a regra geral, e a intenção mais específica
 * é a que vale.
 *
 * O filtro de `isEnabled` mora aqui, e não em quem chama. `matchCategory` fez o
 * contrário e virou armadilha documentada: uma regra que o usuário desativou
 * voltava a valer se o chamador esquecesse o filtro.
 */
function prepareNatureRules(rules: NatureRule[]): NatureRule[] {
  return rules
    .filter((r) => r.isEnabled && foldForMatch(r.matchValue) !== '')
    .sort((a, b) => {
      const escopoA = a.accountId ? 0 : 1
      const escopoB = b.accountId ? 0 : 1
      if (escopoA !== escopoB) return escopoA - escopoB
      if (a.priority !== b.priority) return b.priority - a.priority
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
}

/** Primeira regra preparada que casa, ou `undefined`. */
function matchPrepared(
  foldedDescription: string,
  accountId: string,
  prepared: NatureRule[],
): TransactionNature | undefined {
  for (const rule of prepared) {
    if (rule.accountId !== null && rule.accountId !== accountId) continue

    const needle = foldForMatch(rule.matchValue)
    const hit =
      rule.matchType === 'exact'
        ? foldedDescription === needle
        : foldedDescription.includes(needle)

    if (hit) return rule.nature
  }

  return undefined
}

/** A natureza que as regras do usuário determinam para uma descrição. */
export function natureForDescription(
  description: string,
  accountId: string,
  rules: NatureRule[],
): TransactionNature | undefined {
  return matchPrepared(foldForMatch(description), accountId, prepareNatureRules(rules))
}

/**
 * Aplica as regras a um lote já normalizado.
 *
 * Devolve o MESMO array quando não há regra aplicável, para o caminho comum não
 * pagar uma cópia por página de 500 transações. Nunca altera valor, data ou
 * qualquer outro campo: só `type`.
 */
export function applyNatureRules(
  normalized: NormalizedPolpTransaction[],
  accountId: string,
  rules: NatureRule[],
): NormalizedPolpTransaction[] {
  const prepared = prepareNatureRules(rules)
  if (prepared.length === 0) return normalized

  return normalized.map((tx) => {
    const nature = matchPrepared(foldForMatch(tx.description), accountId, prepared)
    return nature && nature !== tx.type ? { ...tx, type: nature } : tx
  })
}
