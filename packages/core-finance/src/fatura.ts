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
export function fechamentoDoLancamento(l: LancamentoNoCiclo, closingDay: number): string {
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
}

/**
 * Transferência fica fora: no cartão ela é o pagamento da fatura anterior, e
 * somá-la zeraria o total. Previsão já conciliada fica fora porque o realizado
 * que a cumpriu já está na soma.
 */
export function entraNaFatura(
  l: Pick<LancamentoDaFatura, 'type' | 'isIgnored' | 'matchedTransactionId'>,
): boolean {
  return l.type !== 'transfer' && !l.isIgnored && l.matchedTransactionId == null
}

/** Total por fechamento, em centavos com sinal (despesa negativa). */
export function totaisPorFatura(
  lancamentos: readonly LancamentoDaFatura[],
  closingDay: number,
): Map<string, number> {
  const totais = new Map<string, number>()
  for (const l of lancamentos) {
    if (!entraNaFatura(l)) continue
    const f = fechamentoDoLancamento(l, closingDay)
    totais.set(f, (totais.get(f) ?? 0) + l.amountCents)
  }
  return totais
}
