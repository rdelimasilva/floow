import type { NormalizedPolpTransaction, PolpClient } from '@floow/core-finance'

/**
 * Mês da fatura pelo `bill_id`, para a parcela que chega sem data.
 *
 * Na virada da fatura de outubro do Master Black, Airbnb 3/6 e Diroma 3/5
 * vieram com `bill_post_date` igual à data da compra (fatura falsa, descartada
 * pelo normalizador) e sem `bill_forecast_date`. Sem nenhum dos dois, a
 * parcela ia para o dia da compra, em julho. O `bill_id` delas aponta a
 * fatura, e a fatura diz o vencimento.
 */

/** `bill_id` → mês de vencimento (AAAA-MM). Falha da Polp devolve vazio. */
export async function carregarMesesDasFaturas(client: PolpClient, creditCardId: string): Promise<Map<string, string>> {
  try {
    const faturas = await client.listCardBills(creditCardId)
    // O vencimento vem como meia-noite de São Paulo em UTC (03:00Z).
    return new Map(faturas.map((f) => [
      f.id,
      new Date(f.due_date).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7),
    ]))
  } catch (error) {
    console.error('[sync] falha ao ler as faturas do cartão:', error)
    return new Map()
  }
}

/** Só preenche o que falta: o mês que a própria transação traz vale mais. */
export function completarMesDaFatura<T extends Pick<NormalizedPolpTransaction, 'billId' | 'billForecastMonth'>>(
  tx: T,
  meses: ReadonlyMap<string, string>,
): T {
  if (tx.billForecastMonth || !tx.billId) return tx
  const mes = meses.get(tx.billId)
  return mes ? { ...tx, billForecastMonth: mes } : tx
}
