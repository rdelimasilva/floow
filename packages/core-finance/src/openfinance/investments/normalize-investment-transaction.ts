/**
 * Movimentação de investimento da Polp -> evento da carteira.
 *
 * Um só normalizador para os cinco tipos: fundos trocam `transaction_date`
 * por `transaction_conversion_date` e `transaction_quantity` por
 * `transaction_quota_quantity`; o resto é o mesmo vocabulário.
 *
 * Qual valor é o "total" depende do que o evento significa para a carteira:
 * na compra, o que saiu do bolso (bruto); no resto, o que entrou (líquido);
 * no come-cotas, o imposto — é ele que as cotas pagaram.
 */
import type { PolpInvestmentTransaction } from '../polp-investment-types'
import { dateOnly, decimal, mapEventType, moneyCents, type InvestmentEventType } from './convert'

export interface NormalizedInvestmentEvent {
  polpTransactionId: string
  eventType: InvestmentEventType
  /** `transaction_type` cru quando não reconhecido — a ingestão registra issue. */
  unknownType: string | null
  eventDate: string
  quantity: number | null
  unitPrice: number | null
  priceCents: number | null
  totalCents: number | null
  grossCents: number | null
  netCents: number | null
  incomeTaxCents: number | null
  notes: string | null
}

export function normalizeInvestmentTransaction(raw: unknown): NormalizedInvestmentEvent {
  const tx = raw as PolpInvestmentTransaction
  if (!tx?.id) throw new Error('movimentação de investimento sem id')

  const eventDate = dateOnly(tx.transaction_conversion_date ?? tx.transaction_date)
  if (!eventDate) throw new Error(`movimentação ${tx.id} sem data`)

  const { eventType, known } = mapEventType(tx.transaction_type)
  const quantity = decimal(tx.transaction_quota_quantity ?? tx.transaction_quantity)
  const unitPrice = decimal(tx.transaction_quota_price ?? tx.transaction_unit_price)
  const grossCents = moneyCents(tx.transaction_gross_value)
  const netCents = moneyCents(tx.transaction_net_value)
  const valueCents = moneyCents(tx.transaction_value)
  const incomeTaxCents = moneyCents(tx.income_tax)

  return {
    polpTransactionId: tx.id,
    eventType,
    unknownType: known ? null : (tx.transaction_type ?? null),
    eventDate,
    quantity,
    unitPrice,
    priceCents: unitPrice === null ? null : Math.round(unitPrice * 100),
    totalCents: totalFor(eventType, { grossCents, netCents, valueCents, incomeTaxCents }),
    grossCents,
    netCents,
    incomeTaxCents,
    notes: tx.transaction_type_additional_info ?? null,
  }
}

function totalFor(
  eventType: InvestmentEventType,
  v: { grossCents: number | null; netCents: number | null; valueCents: number | null; incomeTaxCents: number | null },
): number | null {
  if (eventType === 'come_cotas') return v.incomeTaxCents ?? v.valueCents ?? v.grossCents
  if (eventType === 'buy') return v.grossCents ?? v.valueCents ?? v.netCents
  return v.netCents ?? v.valueCents ?? v.grossCents
}
