import type { EnrichedPosition } from './queries'

/**
 * Posição encerrada: papel vencido, resgatado ou vendido por inteiro.
 *
 * Do Open Finance basta o saldo zero — o banco segue listando CDB resgatado
 * com saldo 0 e às vezes ainda com quantidade. Manual precisa de quantidade
 * zero também: ativo sem cotação tem valor 0 e continua na carteira.
 */
export function estaEncerrada(p: Pick<EnrichedPosition, 'currentValueCents' | 'quantityHeld' | 'source'>): boolean {
  if (p.currentValueCents !== 0) return false
  return p.source === 'openfinance' || p.quantityHeld === 0
}
