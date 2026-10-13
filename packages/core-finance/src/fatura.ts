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
  /** Fatura em que o banco fechou o lançamento. */
  billId?: string | null
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

/** Fatura fechada como o banco informa (`faturas_do_banco`). */
export interface FaturaDoBanco {
  fechamento: string
  vencimento: string
  /** O que se deve, negativo. */
  totalCents: number
}

/** O fechamento do ciclo anterior, na mesma convenção de `fechamentoNoMes`. */
function fechamentoAnterior(fechamento: string, closingDay: number): string {
  const [ano, mes] = anoMes(fechamento)
  return fechamentoNoMes(ano, mes - 1, closingDay)
}

/**
 * Pagamento que entra no cartão: transferência positiva, real (não previsão)
 * e que vale (não ignorada, não absorvida por outra linha).
 */
function ehPagamento(l: LancamentoDaFatura): boolean {
  return l.type === 'transfer' && l.amountCents > 0 && !l.isIgnored && l.matchedTransactionId == null && !l.ehPrevisao
}

/**
 * Total por fechamento, em centavos com sinal (despesa negativa), pela regra
 * do banco: fatura anterior − pagamentos do ciclo + lançamentos do ciclo.
 *
 * - Fatura que o banco fechou e informou (`faturasDoBanco`) vale o total
 *   dele: a lista de lançamentos pode vir incompleta.
 * - O que se pagou no ciclo além da fatura anterior é crédito e abate esta
 *   (pagamento antecipado: os R$ 3.000 de agosto do Master Black). O que
 *   falta pagar da anterior NÃO vem junto: pagamento ausente no app é quase
 *   sempre dado que não chegou, e somar faturas inteiras ali seria pior.
 * - Sem a fatura anterior (começo do histórico), os pagamentos do ciclo não
 *   mudam nada: pagaram uma fatura que o app não conhece.
 */
export function totaisPorFatura(
  lancamentos: readonly LancamentoDaFatura[],
  closingDay: number,
  opts: { dueDay?: number | null; hoje?: string | null; faturasDoBanco?: readonly FaturaDoBanco[] } = {},
): Map<string, number> {
  const dueDay = opts.dueDay ?? null
  const entram = lancamentos.filter((l) => entraNaFatura(l, opts.hoje ?? null))
  const fechamentos = entram.map((l) => fechamentoDoLancamento(l, closingDay, dueDay))

  // Fatura que o banco já fechou (`bill_id`): todos os lançamentos dela vão
  // juntos para o fechamento em que a maioria cai pelo ciclo cadastrado. O
  // dia real de fechamento varia (fim de semana, feriado, o banco muda) e a
  // compra perto da virada iria para a fatura errada; o bill_id não erra.
  const votos = new Map<string, Map<string, number>>()
  entram.forEach((l, i) => {
    if (!l.billId) return
    const v = votos.get(l.billId) ?? new Map<string, number>()
    v.set(fechamentos[i], (v.get(fechamentos[i]) ?? 0) + 1)
    votos.set(l.billId, v)
  })
  const fechamentoDaFatura = new Map<string, string>()
  for (const [billId, v] of votos) {
    const [melhor] = [...v.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    fechamentoDaFatura.set(billId, melhor[0])
  }
  const doCiclo = (l: LancamentoDaFatura, proprio: string) => (l.billId && fechamentoDaFatura.get(l.billId)) || proprio

  const compras = new Map<string, number>()
  entram.forEach((l, i) => {
    const f = doCiclo(l, fechamentos[i])
    compras.set(f, (compras.get(f) ?? 0) + l.amountCents)
  })

  const pagamentos = new Map<string, number>()
  for (const l of lancamentos) {
    if (!ehPagamento(l)) continue
    const f = doCiclo(l, fechamentoDoLancamento(l, closingDay, dueDay))
    pagamentos.set(f, (pagamentos.get(f) ?? 0) + l.amountCents)
  }

  // O banco fecha em dia próprio; o ciclo é achado pelo mês do vencimento,
  // como o lançamento que traz o mês da fatura.
  const doBanco = new Map<string, number>()
  for (const f of opts.faturasDoBanco ?? []) {
    const ciclo = fechamentoDoLancamento(
      { date: f.vencimento, purchaseDate: null, installmentTotal: null, billForecastMonth: f.vencimento.slice(0, 7) },
      closingDay,
      dueDay ?? Number(f.vencimento.slice(8, 10)),
    )
    doBanco.set(ciclo, f.totalCents)
  }

  const totais = new Map<string, number>()
  // Fatura que o app conhece de fato: informada pelo banco, com compras, ou
  // seguinte a uma conhecida. Ciclo só com pagamento antes do histórico
  // (o débito que quitou uma fatura sem compras no app) não serve de anterior.
  const conhecidas = new Set<string>()
  const ciclos = [...new Set([...compras.keys(), ...pagamentos.keys(), ...doBanco.keys()])].sort()
  for (const f of ciclos) {
    const anteriorConhecida = conhecidas.has(fechamentoAnterior(f, closingDay))
    if (doBanco.has(f) || compras.has(f) || anteriorConhecida) conhecidas.add(f)
    const banco = doBanco.get(f)
    if (banco != null) {
      totais.set(f, banco)
      continue
    }
    const anterior = anteriorConhecida ? totais.get(fechamentoAnterior(f, closingDay)) : undefined
    const sobra = anterior != null ? anterior + (pagamentos.get(f) ?? 0) : 0
    totais.set(f, (compras.get(f) ?? 0) + Math.max(0, sobra))
  }
  return totais
}
