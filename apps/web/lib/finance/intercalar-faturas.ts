import { fechamentosEntre, fechamentoDoLancamento } from '@floow/core-finance/src/fatura'

/**
 * A linha de fatura do extrato do cartão. Calculada, nunca gravada: não entra
 * em saldo, fluxo de caixa, export nem paginação.
 */
export interface FaturaNoExtrato {
  accountId: string
  accountName: string
  /** 'AAAA-MM-DD' */
  fechamento: string
  vencimento: string | null
  totalCents: number
}

export type ItemDoExtrato<T> =
  | { kind: 'tx'; tx: T; idx: number }
  | { kind: 'fatura'; fatura: FaturaNoExtrato }

function dia(date: Date | string): string {
  return (typeof date === 'string' ? date : date.toISOString()).slice(0, 10)
}

/**
 * Encaixa as faturas entre os lançamentos pela data. A fatura fecha no fim do
 * dia: em ordem crescente vem depois dos lançamentos do dia do fechamento; em
 * decrescente, antes deles. `idx` é a posição original do lançamento — a
 * coluna de saldo é indexada por ela.
 */
export function intercalarFaturas<T extends { date: Date | string }>(
  transacoes: readonly T[],
  faturas: readonly FaturaNoExtrato[],
  sortDir: 'asc' | 'desc',
): ItemDoExtrato<T>[] {
  const asc = sortDir === 'asc'
  const pendentes = [...faturas].sort((a, b) =>
    (asc ? a.fechamento.localeCompare(b.fechamento) : b.fechamento.localeCompare(a.fechamento))
    || a.accountName.localeCompare(b.accountName))
  const itens: ItemDoExtrato<T>[] = []
  let f = 0
  transacoes.forEach((tx, idx) => {
    const d = dia(tx.date)
    // Crescente: sai toda fatura que fechou ANTES deste dia.
    // Decrescente: sai toda fatura que fecha neste dia ou depois.
    while (f < pendentes.length && (asc ? pendentes[f].fechamento < d : pendentes[f].fechamento >= d)) {
      itens.push({ kind: 'fatura', fatura: pendentes[f++] })
    }
    itens.push({ kind: 'tx', tx, idx })
  })
  while (f < pendentes.length) itens.push({ kind: 'fatura', fatura: pendentes[f++] })
  return itens
}

export interface IntervaloDaPagina {
  inicio: string
  fim: string
  /** Fim do filtro de período; o próximo fechamento não passa dele. */
  limite: string | null
  /** Página mais recente: mostra também a fatura em aberto. */
  incluirProximo: boolean
}

/**
 * De que datas a página trata. Recortado pelo filtro de período; `null` quando
 * não há linha nenhuma.
 */
export function intervaloDaPagina(
  datas: readonly (Date | string)[],
  opts: { ultimaCronologica: boolean; startDate?: string; endDate?: string },
): IntervaloDaPagina | null {
  if (datas.length === 0) return null
  const dias = datas.map(dia).sort()
  const inicio = opts.startDate && opts.startDate > dias[0] ? opts.startDate : dias[0]
  const ultimo = dias[dias.length - 1]
  const fim = opts.endDate && opts.endDate < ultimo ? opts.endDate : ultimo
  return { inicio, fim, limite: opts.endDate ?? null, incluirProximo: opts.ultimaCronologica }
}

/** Os fechamentos que aparecem na página, para um cartão. */
export function fechamentosDoIntervalo(intervalo: IntervaloDaPagina, closingDay: number): string[] {
  const out = fechamentosEntre(intervalo.inicio, intervalo.fim, closingDay)
  if (intervalo.incluirProximo) {
    // O fechamento seguinte ao último dia é o de um lançamento nesse dia.
    const proximo = fechamentoDoLancamento(
      { date: proximoDia(intervalo.fim), purchaseDate: null, installmentTotal: null },
      closingDay,
    )
    if (!out.includes(proximo) && (!intervalo.limite || proximo <= intervalo.limite)) out.push(proximo)
  }
  return out
}

function proximoDia(data: string): string {
  const d = new Date(`${data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
