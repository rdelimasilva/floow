/**
 * Conversões dos payloads de investimento. Puras, e o único lugar em que
 * string da Polp vira número — ver o cabeçalho de `../normalize.ts`.
 */
import { parseAmountCents, toCompetenceDate } from '../normalize'
import type { PolpMoney } from '../polp-investment-types'

export type InvestmentEventType =
  | 'buy' | 'sell' | 'maturity' | 'interest' | 'amortization'
  | 'dividend' | 'jcp' | 'come_cotas' | 'other'

function rawAmount(v: PolpMoney | number | null | undefined): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return v.amount ?? null
  return v
}

export function moneyCents(v: PolpMoney | null | undefined): number | null {
  const raw = rawAmount(v)
  if (raw === null || raw === '') return null
  return parseAmountCents(String(raw))
}

const DECIMAL = /^\s*-?\d+(\.\d+)?\s*$/

export function decimal(v: PolpMoney | number | null | undefined): number | null {
  const raw = rawAmount(v)
  if (raw === null || raw === '') return null
  if (typeof raw === 'number') return raw
  if (!DECIMAL.test(raw)) throw new Error(`número inválido vindo da Polp: ${JSON.stringify(raw)}`)
  return Number(raw)
}

/**
 * Percentual do indexador em fração (1 = 100% do CDI).
 *
 * A doc mostra "1.000000" na renda fixa bancária e "100" na de crédito para o
 * mesmo 100%. Nenhum título real paga 10x o indexador, então valor acima de 10
 * só pode ser escala percentual. Pendência P2 da spec: confirmar com dado real.
 */
export function toFraction(v: string | null | undefined): number | null {
  const n = decimal(v ?? null)
  if (n === null) return null
  return n > 10 ? n / 100 : n
}

export function dateOnly(v: string | null | undefined): string | null {
  if (!v) return null
  return toCompetenceDate(v)
}

const EVENT_TYPE: Record<string, InvestmentEventType> = {
  APLICACAO: 'buy',
  COMPRA: 'buy',
  RESGATE: 'sell',
  VENDA: 'sell',
  CANCELAMENTO: 'sell',
  VENCIMENTO: 'maturity',
  PAGAMENTO_JUROS: 'interest',
  PREMIO: 'interest',
  AMORTIZACAO: 'amortization',
  DIVIDENDOS: 'dividend',
  ALUGUEIS: 'dividend',
  JCP: 'jcp',
  COME_COTAS: 'come_cotas',
  MULTA: 'other',
  MORA: 'other',
  OUTROS: 'other',
  TRANSFERENCIA_TITULARIDADE: 'other',
  TRANSFERENCIA_CUSTODIA: 'other',
  TRANSFERENCIA_COTAS: 'other',
}

/** `known: false` diz à ingestão que registre issue — enum novo não quebra, mas não passa calado. */
export function mapEventType(raw: string | null | undefined): { eventType: InvestmentEventType; known: boolean } {
  const mapped = raw ? EVENT_TYPE[raw] : undefined
  return mapped ? { eventType: mapped, known: true } : { eventType: 'other', known: false }
}
