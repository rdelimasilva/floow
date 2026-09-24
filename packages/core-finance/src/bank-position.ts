/**
 * Posição de ativo do Open Finance.
 *
 * O VALOR é o que o banco informa — o histórico de movimentações cobre ~12
 * meses e recalcular pelos eventos divergiria em qualquer ativo mais antigo.
 * O CUSTO é o preço de compra que o banco informa, quando informa; senão, a
 * soma das compras conhecidas, marcada como parcial para a tela avisar.
 * Proventos e lucro realizado vêm dos eventos, que é onde eles existem.
 */
import { computePosition, type PortfolioEventInput } from './portfolio'

export interface BankPositionInput {
  quantity: number | null
  grossCents: number | null
  netCents: number | null
  purchaseUnitPrice: number | null
}

export interface BankPositionResult {
  quantityHeld: number
  avgCostCents: number
  totalCostCents: number
  currentPriceCents: number
  currentValueCents: number
  realizedPnLCents: number
  totalDividendsCents: number
  costIsPartial: boolean
}

export function computeBankPosition(
  bank: BankPositionInput | null,
  events: PortfolioEventInput[],
): BankPositionResult {
  const fromEvents = computePosition(events, 0)
  const quantityHeld = bank?.quantity ?? 0
  const currentValueCents = bank ? (bank.netCents ?? bank.grossCents ?? 0) : 0

  const hasPurchasePrice = bank?.purchaseUnitPrice != null && quantityHeld > 0
  // Sem cotas no banco (resgatado por inteiro), não há custo em aberto: o custo
  // das compras conhecidas daria um −100% falso contra valor zero.
  const totalCostCents = quantityHeld <= 0
    ? 0
    : hasPurchasePrice
      ? Math.round(bank!.purchaseUnitPrice! * quantityHeld * 100)
      : fromEvents.totalCostCents

  return {
    quantityHeld,
    avgCostCents: quantityHeld > 0 ? Math.round(totalCostCents / quantityHeld) : 0,
    totalCostCents,
    currentPriceCents: quantityHeld > 0 ? Math.round(currentValueCents / quantityHeld) : 0,
    currentValueCents,
    realizedPnLCents: fromEvents.realizedPnLCents,
    totalDividendsCents: fromEvents.totalDividendsCents,
    costIsPartial: !hasPurchasePrice,
  }
}
