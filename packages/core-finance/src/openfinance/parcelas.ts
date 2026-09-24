/**
 * Regras das parcelas de compra no cartão.
 *
 * A Polp manda cada parcela como uma transação, com a data da COMPRA em
 * todas. Gravar assim punha as dez parcelas de uma compra 10x no mês da
 * compra, e todas dentro do saldo. Cada parcela vale no vencimento da fatura
 * em que cai; as que a Polp ainda não mandou viram previsão.
 */

/** Tolerância entre parcelas da mesma compra: a primeira costuma levar os centavos do arredondamento. */
const TOLERANCIA_DO_GRUPO = 0.01

const SUFIXO_DE_PARCELA = /\s*\d{1,2}\/\d{1,2}\s*$/

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

function montarData(ano: number, mes: number, dia: number): string {
  const d = Math.min(dia, ultimoDiaDoMes(ano, mes))
  return `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Dia `dia` do mês `mes` (pode passar de 12) de `ano`, preso ao fim do mês. */
function dataNoMes(ano: number, mes: number, dia: number): string {
  const total = ano * 12 + (mes - 1)
  return montarData(Math.floor(total / 12), (total % 12) + 1, dia)
}

export function somarMeses(data: string, meses: number): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return dataNoMes(ano, mes + meses, dia)
}

export function dataDaParcela(
  input: { billPostDate: string | null; billForecastMonth: string | null; purchaseDate: string },
  diaDeVencimento: number | null,
): string {
  if (input.billPostDate) return input.billPostDate
  if (!input.billForecastMonth) return input.purchaseDate
  const [ano, mes] = input.billForecastMonth.split('-').map(Number)
  return montarData(ano, mes, diaDeVencimento ?? 1)
}

/**
 * O dia que mais se repete entre os vencimentos já conhecidos. Moda, não o
 * último: vencimento que cai no fim de semana anda para segunda (16 → 18) e
 * não representa o cartão.
 */
export function diaDeVencimentoMaisComum(billPostDates: string[]): number | null {
  const contagem = new Map<number, number>()
  for (const d of billPostDates) {
    const dia = Number(d.slice(8, 10))
    contagem.set(dia, (contagem.get(dia) ?? 0) + 1)
  }
  let melhor: number | null = null
  let vezes = 0
  for (const [dia, n] of contagem) {
    if (n > vezes || (n === vezes && melhor !== null && dia < melhor)) {
      melhor = dia
      vezes = n
    }
  }
  return melhor
}

export function descricaoSemNumeroDaParcela(descricao: string): string {
  return descricao.replace(SUFIXO_DE_PARCELA, '').trim() || descricao
}

export interface ParcelaConhecida {
  purchaseDate: string
  installmentNumber: number
  installmentTotal: number
  amountCents: number
  date: string
  description: string
  categoryId: string | null
}

export type ParcelaPlanejada = ParcelaConhecida

function mesmoValor(a: number, b: number): boolean {
  const maior = Math.max(Math.abs(a), Math.abs(b))
  return maior === 0 || Math.abs(a - b) / maior <= TOLERANCIA_DO_GRUPO
}

/**
 * Agrupa por compra (data da compra + total de parcelas + valor ±1%) e
 * devolve as parcelas que faltam depois da maior conhecida. Recebe reais e
 * previsões já gravadas juntas: número que existe em qualquer uma delas não
 * é planejado de novo, e é isso que torna o sync idempotente.
 */
export function planejarParcelasFaltantes(conhecidas: ParcelaConhecida[]): ParcelaPlanejada[] {
  const grupos: ParcelaConhecida[][] = []
  for (const p of conhecidas) {
    const grupo = grupos.find(
      (g) =>
        g[0].purchaseDate === p.purchaseDate &&
        g[0].installmentTotal === p.installmentTotal &&
        mesmoValor(g[0].amountCents, p.amountCents),
    )
    if (grupo) grupo.push(p)
    else grupos.push([p])
  }

  const planejadas: ParcelaPlanejada[] = []
  for (const grupo of grupos) {
    const maiorNumero = (a: ParcelaConhecida, b: ParcelaConhecida) => (b.installmentNumber > a.installmentNumber ? b : a)
    const ultima = grupo.reduce(maiorNumero)
    // A âncora das datas é a maior parcela que venceu no dia de sempre: a
    // última pode ter andado por fim de semana (30/11 → 01/12), e somar meses
    // a partir dela empurraria cada previsão um mês para frente.
    const dia = diaDeVencimentoMaisComum(grupo.map((p) => p.date)) as number
    const noDia = grupo.filter((p) => Number(p.date.slice(8, 10)) === dia)
    const ancora = noDia.length > 0 ? noDia.reduce(maiorNumero) : ultima
    const [anoAncora, mesAncora] = ancora.date.split('-').map(Number)
    const existentes = new Set(grupo.map((p) => p.installmentNumber))
    for (let n = ultima.installmentNumber + 1; n <= ultima.installmentTotal; n++) {
      if (existentes.has(n)) continue
      planejadas.push({
        purchaseDate: ultima.purchaseDate,
        installmentNumber: n,
        installmentTotal: ultima.installmentTotal,
        amountCents: ultima.amountCents,
        date: dataNoMes(anoAncora, mesAncora + (n - ancora.installmentNumber), dia),
        description: descricaoSemNumeroDaParcela(ultima.description),
        categoryId: ultima.categoryId,
      })
    }
  }
  return planejadas
}
