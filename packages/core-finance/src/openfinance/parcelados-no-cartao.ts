/**
 * Compras parceladas no cartão vistas como dívida.
 *
 * Não há cadastro: a dívida é o que falta das parcelas já gravadas. O Open
 * Finance manda (ou `completarParcelas` prevê) todas as parcelas de uma
 * compra, e a compra parcelada manual vem da recorrência com quantidade
 * fixa. Parcela com vencimento até hoje conta como paga.
 */
import { descricaoSemNumeroDaParcela, mesmoValor } from './parcelas'

const SUFIXO_DA_RECORRENCIA = /\s*\(\d{1,3}\/\d{1,3}\)\s*$/

export interface ParcelaDoCartao {
  accountId: string
  accountName: string
  /** O que junta as parcelas: data da compra (Open Finance) ou id da recorrência (manual). */
  compra: string
  installmentNumber: number
  installmentTotal: number
  /** Positivo. */
  amountCents: number
  /** AAAA-MM-DD: vencimento da fatura em que a parcela cai. */
  date: string
  description: string
}

export interface ParceladoNoCartao {
  chave: string
  accountId: string
  accountName: string
  description: string
  installmentTotal: number
  paidCount: number
  installmentCents: number
  totalCents: number
  paidCents: number
  remainingCents: number
  nextDueDate: string
  /** As que ainda vencem, em ordem: base do comprometimento mês a mês. */
  parcelasFuturas: { installmentNumber: number; date: string; amountCents: number }[]
}

export interface ComprometimentoDoMes {
  /** AAAA-MM do vencimento da fatura. */
  mes: string
  totalCents: number
  quantidade: number
}

function semNumeroDaParcela(descricao: string): string {
  return descricaoSemNumeroDaParcela(descricao.replace(SUFIXO_DA_RECORRENCIA, '').trim() || descricao)
}

export function agruparParceladosNoCartao(parcelas: ParcelaDoCartao[], hoje: string): ParceladoNoCartao[] {
  const grupos: ParcelaDoCartao[][] = []
  for (const p of parcelas) {
    const grupo = grupos.find(
      (g) =>
        g[0].accountId === p.accountId &&
        g[0].compra === p.compra &&
        g[0].installmentTotal === p.installmentTotal &&
        mesmoValor(g[0].amountCents, p.amountCents),
    )
    if (grupo) grupo.push(p)
    else grupos.push([p])
  }

  const resultado: ParceladoNoCartao[] = []
  for (const grupo of grupos) {
    // Real e previsão do mesmo número não deveriam coexistir; se coexistirem, vale uma.
    const porNumero = new Map<number, ParcelaDoCartao>()
    for (const p of grupo) if (!porNumero.has(p.installmentNumber)) porNumero.set(p.installmentNumber, p)
    const unicas = [...porNumero.values()].sort((a, b) => a.installmentNumber - b.installmentNumber)

    const futuras = unicas.filter((p) => p.date > hoje)
    if (futuras.length === 0) continue

    const ultima = unicas[unicas.length - 1]
    const total = ultima.installmentTotal
    // Número que nunca chegou (janela de 12 meses do banco) vale o mesmo que a última parcela.
    const faltantes = Math.max(0, total - unicas.length)
    const totalCents = unicas.reduce((s, p) => s + p.amountCents, 0) + faltantes * ultima.amountCents
    const remainingCents = futuras.reduce((s, p) => s + p.amountCents, 0)

    resultado.push({
      chave: `${grupo[0].accountId}:${grupo[0].compra}:${total}:${grupo[0].amountCents}`,
      accountId: grupo[0].accountId,
      accountName: grupo[0].accountName,
      description: semNumeroDaParcela(ultima.description),
      installmentTotal: total,
      paidCount: total - futuras.length,
      installmentCents: futuras[0].amountCents,
      totalCents,
      paidCents: totalCents - remainingCents,
      remainingCents,
      nextDueDate: futuras[0].date,
      parcelasFuturas: futuras.map((p) => ({ installmentNumber: p.installmentNumber, date: p.date, amountCents: p.amountCents })),
    })
  }

  return resultado.sort(
    (a, b) => a.nextDueDate.localeCompare(b.nextDueDate) || a.description.localeCompare(b.description, 'pt-BR'),
  )
}

/** Quanto das faturas de cada mês já está tomado por parcela, do mais próximo ao mais distante. */
export function comprometimentoPorMes(parcelados: ParceladoNoCartao[]): ComprometimentoDoMes[] {
  const porMes = new Map<string, ComprometimentoDoMes>()
  for (const p of parcelados) {
    for (const f of p.parcelasFuturas) {
      const mes = f.date.slice(0, 7)
      const atual = porMes.get(mes) ?? { mes, totalCents: 0, quantidade: 0 }
      atual.totalCents += f.amountCents
      atual.quantidade += 1
      porMes.set(mes, atual)
    }
  }
  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes))
}

/** A parcela da compra que cai no mês (AAAA-MM), se houver. */
export function parcelaDoMes(p: ParceladoNoCartao, mes: string) {
  return p.parcelasFuturas.find((f) => f.date.startsWith(mes)) ?? null
}
