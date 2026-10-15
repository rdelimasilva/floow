import type { PolpCardBill } from '@floow/core-finance'

/**
 * O que a fatura do banco cobra e o Open Finance não informa.
 *
 * O Open Finance entrega 12 meses de transações de cartão, contados pela data
 * da transação, e a parcela carrega a data da compra. Parcela de compra
 * anterior à janela não chega, mesmo lançada numa fatura dentro dela (Polp,
 * 14/10/2026). No Master Black, a antecipação de 23/11/2025 trouxe para a
 * fatura de 09/12 R$ 17.243,18 em parcelas de compras antigas, e janeiro a
 * junho/2026 ficaram de R$ 50 a R$ 130 abaixo do total, mês a mês.
 *
 * O total da fatura fechada é do banco (`GET /credit-cards/{id}/bills`). Pela
 * regra dele, o que a conta do cartão anda num ciclo é a fatura anterior
 * menos a atual. Se o app andou menos (faltam débitos), a falta vira uma linha
 * por fatura, recalculada a cada sync: some sozinha se a parcela chegar.
 * Sobra (o app com débito a mais) não vira linha — é lançamento a achar.
 *
 * O primeiro ciclo do histórico parte do zero: os pagamentos que quitaram a
 * fatura anterior ao início ficam fora do app (`inicio-do-cartao.ts`).
 */

/** Prefixo do `external_id` das linhas desta regra. */
export const PREFIXO_DIFERENCA = 'diferenca-da-fatura:'

export interface FaturaFechada {
  fechamento: string
  /** Mês do vencimento, AAAA-MM. */
  mesDoVencimento: string
  billIds: string[]
  /** O que se deve, negativo. */
  totalCents: number
}

export interface LinhaDoCartao {
  amountCents: number
  date: string
  billId: string | null
  billForecastMonth: string | null
}

/** A data vem como meia-noite de São Paulo em UTC (03:00Z). */
function diaEmSaoPaulo(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function diaSeguinte(d: string): string {
  const x = new Date(`${d}T00:00:00Z`)
  x.setUTCDate(x.getUTCDate() + 1)
  return x.toISOString().slice(0, 10)
}

/** Uma por fechamento: o banco às vezes devolve a mesma fatura com dois ids. */
export function faturasFechadas(faturas: readonly PolpCardBill[]): FaturaFechada[] {
  const porFechamento = new Map<string, FaturaFechada>()
  for (const f of faturas) {
    const fechamento = diaEmSaoPaulo(f.bill_closing_date)
    const existente = porFechamento.get(fechamento)
    if (existente) {
      existente.billIds.push(f.id)
      continue
    }
    porFechamento.set(fechamento, {
      fechamento,
      mesDoVencimento: diaEmSaoPaulo(f.due_date).slice(0, 7),
      billIds: [f.id],
      totalCents: -Math.round(Number(f.bill_total_amount.amount) * 100),
    })
  }
  return [...porFechamento.values()].sort((a, b) => a.fechamento.localeCompare(b.fechamento))
}

/**
 * O fechamento da fatura em que a linha está: a fatura que o banco disse
 * (`bill_id`, depois o mês do vencimento) e, sem isso, o primeiro fechamento
 * na data ou depois dela. Pagamento não traz fatura e cai no ciclo em que foi
 * feito, como o banco conta. Null: fatura ainda aberta.
 */
export function fechamentoDaLinha(l: LinhaDoCartao, faturas: readonly FaturaFechada[]): string | null {
  if (l.billId) {
    const f = faturas.find((x) => x.billIds.includes(l.billId!))
    if (f) return f.fechamento
  }
  if (l.billForecastMonth) {
    const f = faturas.find((x) => x.mesDoVencimento === l.billForecastMonth)
    if (f) return f.fechamento
    // Mês de fatura que o banco ainda não fechou.
    if (l.billForecastMonth > (faturas.at(-1)?.mesDoVencimento ?? '')) return null
  }
  return faturas.find((x) => x.fechamento >= l.date)?.fechamento ?? null
}

/**
 * Fechamento → falta (negativo) de cada fatura fechada desde o início do
 * histórico. Fatura sem a anterior conhecida fica de fora: sem ela não há
 * como saber quanto o ciclo andou.
 */
export function faltasPorFatura(
  linhas: readonly LinhaDoCartao[],
  faturas: readonly FaturaFechada[],
  inicio: string,
): Map<string, number> {
  const andou = new Map<string, number>()
  for (const l of linhas) {
    const f = fechamentoDaLinha(l, faturas)
    if (f) andou.set(f, (andou.get(f) ?? 0) + l.amountCents)
  }

  const faltas = new Map<string, number>()
  faturas.forEach((f, i) => {
    if (f.fechamento < inicio) return
    const anterior = faturas[i - 1]
    if (!anterior) return
    // A fatura anterior ao início foi quitada fora do app: o ciclo parte do zero.
    const base = anterior.fechamento >= inicio ? anterior.totalCents : diaSeguinte(anterior.fechamento) === inicio ? 0 : null
    if (base == null) return
    const esperado = f.totalCents - base
    const falta = esperado - (andou.get(f.fechamento) ?? 0)
    faltas.set(f.fechamento, Math.min(0, falta))
  })
  return faltas
}
