import type { FaturaNoExtrato } from './intercalar-faturas'

export interface PagamentoDoCartao {
  accountId: string
  /** 'AAAA-MM-DD' */
  date: string
  amountCents: number
}

/**
 * A fatura que o cartão mostra, por cartão: a que o banco fechou, até o
 * vencimento e enquanto não foi paga; fora disso, a que está aberta.
 *
 * Mostrar sempre a aberta deixava o cartão com as compras de poucos dias logo
 * depois do fechamento, enquanto o banco cobrava a fatura fechada.
 *
 * `faturas` traz, por cartão, os fechamentos do último mês e o seguinte. O
 * fechamento de hoje ainda conta como aberto.
 */
export function faturasAPagar(
  faturas: readonly FaturaNoExtrato[],
  pagamentos: readonly PagamentoDoCartao[],
  hoje: string,
): Map<string, number> {
  const porCartao = new Map<string, FaturaNoExtrato[]>()
  for (const f of faturas) porCartao.set(f.accountId, [...(porCartao.get(f.accountId) ?? []), f])

  const out = new Map<string, number>()
  for (const [accountId, lista] of porCartao) {
    const ordenadas = [...lista].sort((a, b) => a.fechamento.localeCompare(b.fechamento))
    const aberta = ordenadas.find((f) => f.fechamento >= hoje)
    const fechada = ordenadas.filter((f) => f.fechamento < hoje).at(-1)
    const pago = fechada
      ? pagamentos
          .filter((p) => p.accountId === accountId && p.date > fechada.fechamento && p.amountCents > 0)
          .reduce((s, p) => s + p.amountCents, 0)
      : 0
    const aPagar = fechada && fechada.totalCents < 0 && fechada.vencimento != null
      && hoje <= fechada.vencimento && pago < -fechada.totalCents
    const escolhida = aPagar ? fechada : aberta
    if (escolhida) out.set(accountId, escolhida.totalCents)
  }
  return out
}
