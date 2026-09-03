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
 * Forma canônica para CASAR regra do tipo `contains` com descrição.
 *
 * Além do que `foldForMatch` faz, apaga as sequências numéricas: a mesma
 * operação repetida todo mês chega com data e número diferentes no meio da
 * descrição, e é justamente por isso que a chave do grupo (`groupKey`) nasce
 * sem eles. Os dois lados dessa comparação têm de passar por aqui — comparar
 * chave sem dígito contra descrição com dígito só casa quando o número está
 * na ponta, e falha em silêncio no resto.
 *
 * Só entra na comparação `contains`. `exact` existe para dizer "a descrição
 * inteira, sem variação nenhuma"; apagar dígito dali removeria a única
 * diferença que resta entre os dois tipos e uma regra `exact` passaria a
 * casar com qualquer parcela da mesma operação.
 */
export function foldForRuleMatch(value: string): string {
  return foldForMatch(value)
    .replace(/\d[\d./-]*/g, ' ')
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
    .filter((r) => r.isEnabled && ruleNeedle(r) !== '')
    .sort((a, b) => {
      const escopoA = a.accountId ? 0 : 1
      const escopoB = b.accountId ? 0 : 1
      if (escopoA !== escopoB) return escopoA - escopoB
      if (a.priority !== b.priority) return b.priority - a.priority
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
}

/**
 * O `matchValue` dobrado no formato que o `matchType` da regra exige:
 * `exact` compara a descrição inteira, sem apagar dígito; `contains` compara
 * ignorando dígito, o mesmo tratamento que `groupKey` já aplicou à chave.
 */
function ruleNeedle(rule: NatureRule): string {
  return rule.matchType === 'exact' ? foldForMatch(rule.matchValue) : foldForRuleMatch(rule.matchValue)
}

/** Primeira regra preparada que casa, ou `undefined`. */
function matchPrepared(description: string, accountId: string, prepared: NatureRule[]): TransactionNature | undefined {
  // Duas dobras da MESMA descrição, uma para cada `matchType` — comparar
  // chave sem dígito contra descrição com dígito é exatamente o bug que
  // fazia o backfill devolver `reclassified: 0`.
  const foldedExact = foldForMatch(description)
  const foldedContains = foldForRuleMatch(description)

  for (const rule of prepared) {
    if (rule.accountId !== null && rule.accountId !== accountId) continue

    const needle = ruleNeedle(rule)
    const hit =
      rule.matchType === 'exact' ? foldedExact === needle : foldedContains.includes(needle)

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
  return matchPrepared(description, accountId, prepareNatureRules(rules))
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
    const nature = matchPrepared(tx.description, accountId, prepared)
    return nature && nature !== tx.type ? { ...tx, type: nature } : tx
  })
}
