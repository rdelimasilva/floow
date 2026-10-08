/**
 * Fatura do cartão: a que fechamento cada lançamento pertence e quanto soma
 * cada fatura.
 *
 * O fechamento vem do dia cadastrado na conta (`accounts.closing_day`). A
 * fatura é uma linha de leitura no extrato, nunca gravada: o dinheiro sai de
 * verdade no pagamento, que é a transferência da conta corrente para o cartão.
 *
 * Datas como 'AAAA-MM-DD' e aritmética em UTC — só dia, sem fuso.
 */

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** `mes` de 1 a 12, e pode transbordar (13 = janeiro do ano seguinte). */
function normalizar(ano: number, mes: number): [number, number] {
  const d = new Date(Date.UTC(ano, mes - 1, 1))
  return [d.getUTCFullYear(), d.getUTCMonth() + 1]
}

/** Dia maior que o mês (31 em fevereiro) vira o último dia. */
export function fechamentoNoMes(ano: number, mes: number, dia: number): string {
  const [a, m] = normalizar(ano, mes)
  return `${a}-${pad(m)}-${pad(Math.min(dia, ultimoDiaDoMes(a, m)))}`
}

function anoMes(data: string): [number, number] {
  return [Number(data.slice(0, 4)), Number(data.slice(5, 7))]
}

/** Os fechamentos em [inicio, fim], nas duas pontas inclusive. */
export function fechamentosEntre(inicio: string, fim: string, closingDay: number): string[] {
  const out: string[] = []
  let [ano, mes] = anoMes(inicio)
  for (;;) {
    const f = fechamentoNoMes(ano, mes, closingDay)
    if (f > fim) break
    if (f >= inicio) out.push(f)
    ;[ano, mes] = normalizar(ano, mes + 1)
  }
  return out
}

export interface LancamentoNoCiclo {
  date: string
  purchaseDate: string | null
  installmentTotal: number | null
  /** Mês de vencimento da fatura em que o banco pôs o lançamento (AAAA-MM). */
  billForecastMonth?: string | null
}

/**
 * O fechamento da fatura em que o lançamento cai.
 *
 * Lançamento comum: primeiro fechamento na data ou depois dela.
 *
 * Parcela do Open Finance é a exceção. A data dela já é o vencimento da fatura
 * (`bill_post_date`, ver spec das parcelas do cartão), e o vencimento vem
 * depois do fechamento. Pela regra comum a parcela iria para a fatura
 * seguinte; o fechamento dela é o último ANTES da data. Parcela manual não tem
 * `purchaseDate` e segue a regra comum.
 */
export function fechamentoDoLancamento(l: LancamentoNoCiclo, closingDay: number, dueDay: number | null = null): string {
  // O banco já disse em que fatura o lançamento está: vale mais que o dia de
  // fechamento cadastrado, que é aproximado (o Master Black cadastrado no dia
  // 8 fechou no dia 7, e a compra do dia 8 foi para a fatura seguinte).
  if (l.billForecastMonth && dueDay != null) {
    const [a, m] = anoMes(l.billForecastMonth)
    return dueDay > closingDay ? fechamentoNoMes(a, m, closingDay) : fechamentoNoMes(a, m - 1, closingDay)
  }
  const [ano, mes] = anoMes(l.date)
  const noMes = fechamentoNoMes(ano, mes, closingDay)
  const ehParcelaDoBanco = l.purchaseDate != null && (l.installmentTotal ?? 0) > 1
  if (ehParcelaDoBanco) {
    return noMes < l.date ? noMes : fechamentoNoMes(ano, mes - 1, closingDay)
  }
  return l.date <= noMes ? noMes : fechamentoNoMes(ano, mes + 1, closingDay)
}

/** Primeiro dia de vencimento depois do fechamento. */
export function vencimentoDaFatura(fechamento: string, dueDay: number | null): string | null {
  if (dueDay == null) return null
  const [ano, mes] = anoMes(fechamento)
  const noMes = fechamentoNoMes(ano, mes, dueDay)
  return noMes > fechamento ? noMes : fechamentoNoMes(ano, mes + 1, dueDay)
}

export interface LancamentoDaFatura extends LancamentoNoCiclo {
  amountCents: number
  type: string
  isIgnored: boolean
  matchedTransactionId: string | null
  /** Previsão de recorrência ou de parcela, não lançamento real. */
  ehPrevisao?: boolean
  balanceApplied?: boolean
}

/**
 * Transferência fica fora: no cartão ela é o pagamento da fatura anterior, e
 * somá-la zeraria o total. Previsão já conciliada fica fora porque o realizado
 * que a cumpriu já está na soma. Previsão que venceu sem se confirmar também:
 * ou o gasto real já está no extrato com outro nome (a meta de R$ 3.000 de
 * supermercado contava junto com as compras do supermercado), ou não houve.
 */
export function entraNaFatura(
  l: Pick<LancamentoDaFatura, 'type' | 'isIgnored' | 'matchedTransactionId' | 'ehPrevisao' | 'balanceApplied' | 'date'>,
  hoje: string | null = null,
): boolean {
  if (l.type === 'transfer' || l.isIgnored || l.matchedTransactionId != null) return false
  if (hoje && l.ehPrevisao && !l.balanceApplied && l.date < hoje) return false
  return true
}

/** Total por fechamento, em centavos com sinal (despesa negativa). */
export function totaisPorFatura(
  lancamentos: readonly LancamentoDaFatura[],
  closingDay: number,
  opts: { dueDay?: number | null; hoje?: string | null } = {},
): Map<string, number> {
  const totais = new Map<string, number>()
  for (const l of lancamentos) {
    if (!entraNaFatura(l, opts.hoje ?? null)) continue
    const f = fechamentoDoLancamento(l, closingDay, opts.dueDay ?? null)
    totais.set(f, (totais.get(f) ?? 0) + l.amountCents)
  }
  return totais
}
