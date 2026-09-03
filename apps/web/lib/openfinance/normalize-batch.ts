import type { NormalizedPolpTransaction } from '@floow/core-finance'

/**
 * Normaliza um lote tolerando item defeituoso.
 *
 * O normalizador levanta erro de propósito em valor ou data que não reconhece:
 * transformar formato estranho em `NaN` silencioso seria pior, porque o número
 * errado entraria no saldo e ninguém saberia. Mas até agora esse erro subia por
 * um `page.map()`, e derrubava a página inteira — 499 transações boas perdidas
 * por causa de uma.
 *
 * Em produção, com clientes, esse desenho não se sustenta: eu não vou estar
 * olhando o payload de cada cliente para descobrir o que a instituição mandou
 * de diferente. O lote precisa entrar, e o que não deu precisa ficar
 * registrado com o payload — para consertar depois e reimportar, em vez de
 * bloquear tudo agora.
 */

export interface RejectedItem {
  /** `id` da transação na Polp, quando reconhecível. */
  externalId: string | null
  reason: string
  /** Payload cru, para diagnosticar e reprocessar. */
  raw: unknown
}

export interface BatchResult {
  ok: NormalizedPolpTransaction[]
  rejected: RejectedItem[]
}

export function normalizeBatch<T>(
  items: T[],
  normalize: (item: T) => NormalizedPolpTransaction,
): BatchResult {
  const ok: NormalizedPolpTransaction[] = []
  const rejected: RejectedItem[] = []

  for (const item of items) {
    try {
      ok.push(normalize(item))
    } catch (error) {
      rejected.push({
        externalId: externalIdOf(item),
        reason: error instanceof Error ? error.message : String(error),
        raw: item,
      })
    }
  }

  return { ok, rejected }
}

/** O id da Polp, se o payload tiver um. Sem ele a trilha ainda vale pelo raw. */
function externalIdOf(item: unknown): string | null {
  if (item && typeof item === 'object' && 'id' in item) {
    const id = (item as { id: unknown }).id
    if (typeof id === 'string' && id.length > 0) return id
  }
  return null
}
