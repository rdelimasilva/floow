/**
 * Portfolio position calculation engine — pure functions only.
 *
 * computePosition: calculates position state from a list of portfolio events.
 * This module is safe for client-side bundling (no DB runtime imports).
 *
 * Rules:
 *  - Events are sorted chronologically before processing
 *  - buy: add quantity, add totalCents to cost basis
 *  - sell/maturity: liquidam como venda — realiza PnL, reduz quantidade e custo
 *  - split: multiply quantity by splitRatio, total cost unchanged, avg cost recalculated
 *  - dividend/interest/amortization/jcp: add totalCents to totalDividendsCents
 *  - come_cotas: reduz quantidade (IR antecipado pago em cotas), custo total não muda
 *  - tax/other: ficam no histórico, não afetam posição nem proventos
 *  - avgCostCents = Math.round(totalCostCents / quantityHeld) — 0 if quantityHeld = 0
 *  - All divisions use Math.round() to maintain integer cents convention
 */

/**
 * Union dos tipos de evento de carteira — inclui os que só o Open Finance
 * produz (come_cotas, jcp, maturity, tax, other).
 */
export type PortfolioEventType =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'interest'
  | 'split'
  | 'amortization'
  | 'come_cotas'
  | 'jcp'
  | 'maturity'
  | 'tax'
  | 'other'

/**
 * Input interface for a single portfolio event.
 * Safe to use on both client and server (no DB dependency at runtime).
 */
export interface PortfolioEventInput {
  eventType: PortfolioEventType
  quantity: number | null
  priceCents: number | null
  totalCents: number | null
  splitRatio: string | null
  eventDate: Date
}

/**
 * Result of computing a position from event history.
 */
export interface PositionResult {
  /** Current quantity held (after all buys, sells, splits) */
  quantityHeld: number
  /** Weighted average cost per share in cents */
  avgCostCents: number
  /** Total cost basis in cents (quantityHeld * avgCostCents after rounding) */
  totalCostCents: number
  /** Total realized profit/loss in cents from completed sells */
  realizedPnLCents: number
  /** Total income from dividends, interest, and amortization in cents */
  totalDividendsCents: number
}

/**
 * Pure function: computes portfolio position from an array of portfolio events.
 *
 * @param events - Portfolio events (buy, sell, split, dividend, etc.)
 * @param currentPriceCents - Current market price per share in cents (for future unrealized PnL)
 * @returns PositionResult with all position metrics
 */
export function computePosition(
  events: PortfolioEventInput[],
  _currentPriceCents: number
): PositionResult {
  if (events.length === 0) {
    return {
      quantityHeld: 0,
      avgCostCents: 0,
      totalCostCents: 0,
      realizedPnLCents: 0,
      totalDividendsCents: 0,
    }
  }

  // Sort events chronologically — critical for correct cost basis computation
  const sortedEvents = [...events].sort(
    (a, b) => a.eventDate.getTime() - b.eventDate.getTime()
  )

  let quantityHeld = 0
  let totalCostCents = 0
  let realizedPnLCents = 0
  let totalDividendsCents = 0

  for (const event of sortedEvents) {
    switch (event.eventType) {
      case 'buy': {
        const qty = event.quantity ?? 0
        const cost = event.totalCents ?? 0
        quantityHeld += qty
        totalCostCents += cost
        break
      }

      case 'sell':
      case 'maturity': {
        const qty = event.quantity ?? 0
        const proceeds = event.totalCents ?? 0

        // Compute the cost of the shares being sold using current avg cost
        const avgCostBeforeSell = quantityHeld > 0
          ? Math.round(totalCostCents / quantityHeld)
          : 0
        const costOfSoldShares = avgCostBeforeSell * qty

        // Realized PnL = proceeds - cost of sold shares
        realizedPnLCents += proceeds - costOfSoldShares

        // Reduce position
        quantityHeld -= qty
        totalCostCents -= costOfSoldShares

        // Guard against floating point drift
        if (quantityHeld <= 0) {
          quantityHeld = 0
          totalCostCents = 0
        }
        break
      }

      case 'split': {
        // splitRatio is a string (e.g., '2.0000') for numeric precision
        const ratio = parseFloat(event.splitRatio ?? '1')
        if (!isNaN(ratio) && ratio > 0) {
          // Quantity multiplied by ratio, total cost unchanged, avg cost recalculated
          quantityHeld = Math.round(quantityHeld * ratio)
          // totalCostCents is unchanged — cost basis stays the same after a split
        }
        break
      }

      case 'dividend':
      case 'jcp':
      case 'interest':
      case 'amortization': {
        totalDividendsCents += event.totalCents ?? 0
        break
      }

      // Come-cotas é IR antecipado pago em COTAS: o fundo recolhe o imposto
      // resgatando parte delas. O dinheiro investido não muda, as cotas caem —
      // o custo total fica e o custo médio por cota sobe.
      case 'come_cotas': {
        quantityHeld -= event.quantity ?? 0
        if (quantityHeld <= 0) {
          quantityHeld = 0
          totalCostCents = 0
        }
        break
      }

      // tax e other ficam no histórico, fora da conta.
      case 'tax':
      case 'other':
        break

      default:
        // Unknown event type — silently skip
        break
    }
  }

  // Recalculate avg cost (0 if no shares held)
  const avgCostCents = quantityHeld > 0
    ? Math.round(totalCostCents / quantityHeld)
    : 0

  return {
    quantityHeld,
    avgCostCents,
    totalCostCents,
    realizedPnLCents,
    totalDividendsCents,
  }
}
