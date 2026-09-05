/**
 * Identidade de uma contraparte, para o Nível 2 da ingestão. Função pura,
 * sem I/O — quem consulta e grava é `resolve-counterparty.ts`.
 *
 * Ver docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md
 */

export interface CounterpartyKey {
  keyType: 'tax_id' | 'description'
  keyValue: string
  direction: 'in' | 'out'
  /** NULL para tax_id (mesma entidade em qualquer conta). Obrigatório para description. */
  accountId: string | null
}

/**
 * Forma canônica dos dois lados de qualquer comparação: sem acento, sem
 * caixa, sem espaço sobrando.
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
 * Além do que `foldForMatch` faz, apaga sequências numéricas: a mesma
 * operação repetida todo mês chega com data e número diferentes no meio da
 * descrição ("Débito automático PERS BLACK 12/08 1234"), e sem isso a mesma
 * contraparte criaria uma linha nova a cada sincronização.
 */
function foldForIdentity(value: string): string {
  return foldForMatch(value)
    .replace(/\d[\d./-]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface KeyableTransaction {
  counterpartyTaxId: string | null
  description: string
  amountCents: number
}

/**
 * A chave que identifica esta contraparte, ou null quando a descrição não
 * sobra nada depois de normalizada (nunca acontece com dado real, mas um
 * candidato sem chave cai pendente sem contraparte em vez de quebrar a
 * sincronização inteira — ver `resolve-counterparty.ts`).
 */
export function counterpartyKeyFor(tx: KeyableTransaction, accountId: string): CounterpartyKey | null {
  const direction: CounterpartyKey['direction'] = tx.amountCents >= 0 ? 'in' : 'out'

  if (tx.counterpartyTaxId) {
    return { keyType: 'tax_id', keyValue: tx.counterpartyTaxId, direction, accountId: null }
  }

  const keyValue = foldForIdentity(tx.description)
  if (!keyValue) return null

  return { keyType: 'description', keyValue, direction, accountId }
}

/** String única para usar como chave de Map —   nunca aparece em CNPJ, descrição ou id de conta. */
export function compositeKey(key: CounterpartyKey): string {
  return [key.keyType, key.keyValue, key.direction, key.accountId ?? ''].join(' ')
}
