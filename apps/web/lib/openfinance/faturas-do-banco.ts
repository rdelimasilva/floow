import { sql } from 'drizzle-orm'
import { faturasDoBanco } from '@floow/db'
import type { NormalizedPolpTransaction, PolpCardBill, PolpClient } from '@floow/core-finance'
import type { Db } from './persist-page'

/**
 * As faturas fechadas que o banco informa (`GET /credit-cards/{id}/bills`).
 * Lidas uma vez por passada do sync do cartão, servem a três coisas:
 *
 *  - o mês da parcela que chega sem data (`completarMesDaFatura`);
 *  - o total da fatura fechada, gravado em `faturas_do_banco`;
 *  - os pagamentos que o banco abateu, que reconhecem o pagamento antecipado
 *    no extrato do cartão (`pagamento-de-fatura.ts`).
 */

/** Falha da Polp devolve vazio: o sync segue sem o que vem das faturas. */
export async function carregarFaturasDoBanco(client: PolpClient, creditCardId: string): Promise<PolpCardBill[]> {
  try {
    return await client.listCardBills(creditCardId)
  } catch (error) {
    console.error('[sync] falha ao ler as faturas do cartão:', error)
    return []
  }
}

/** A data vem como meia-noite de São Paulo em UTC (03:00Z). */
function diaEmSaoPaulo(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function centavos(valor: string): number {
  return Math.round(Number(valor) * 100)
}

/** `bill_id` → mês de vencimento (AAAA-MM). */
export function mesesDasFaturas(faturas: readonly PolpCardBill[]): Map<string, string> {
  return new Map(faturas.map((f) => [f.id, diaEmSaoPaulo(f.due_date).slice(0, 7)]))
}

/**
 * Mês da fatura pelo `bill_id`, para a parcela que chega sem data ou com
 * mês posterior ao da fatura fechada.
 *
 * Na virada da fatura de outubro do Master Black, Airbnb 3/6 e Diroma 3/5
 * vieram com `bill_post_date` igual à data da compra (fatura falsa, descartada
 * pelo normalizador) e sem `bill_forecast_date`. Sem nenhum dos dois, a
 * parcela ia para o dia da compra, em julho. O `bill_id` delas aponta a
 * fatura, e a fatura diz o vencimento.
 *
 * Mês posterior ao da fatura fechada também cede a ela. Na compra
 * cancelada (On Sportswear 12x, Master Black, nov/26), o banco antecipou as
 * parcelas 3 a 12 para a fatura de novembro e a Polp manteve o mês previsto
 * de cada uma (dez/26 a set/27). Só com elas em novembro a soma bate com o
 * total do banco. Mês anterior ao da fatura continua valendo.
 */
export function completarMesDaFatura<T extends Pick<NormalizedPolpTransaction, 'billId' | 'billForecastMonth'>>(
  tx: T,
  meses: ReadonlyMap<string, string>,
): T {
  const mes = tx.billId ? meses.get(tx.billId) : undefined
  if (!mes || (tx.billForecastMonth && tx.billForecastMonth <= mes)) return tx
  return { ...tx, billForecastMonth: mes }
}

export interface PagamentoDoBanco {
  /** Positivo: o pagamento entra no cartão. */
  amountCents: number
  date: string
}

/**
 * Todo pagamento abatido de alguma fatura, com valor e dia. O banco às vezes
 * devolve a mesma fatura duas vezes, com ids diferentes (julho do Master
 * Black): vale uma por fechamento. Dois pagamentos iguais na mesma fatura
 * são dois (Visa, 01/02: duas vezes R$ 1.998,92).
 */
export function pagamentosDoBanco(faturas: readonly PolpCardBill[]): PagamentoDoBanco[] {
  const porFechamento = new Map<string, PolpCardBill>()
  for (const f of faturas) {
    const fechamento = diaEmSaoPaulo(f.bill_closing_date)
    if (!porFechamento.has(fechamento)) porFechamento.set(fechamento, f)
  }
  return [...porFechamento.values()].flatMap((f) =>
    (f.payments ?? []).map((p) => ({ amountCents: centavos(p.amount), date: p.paymentDate.slice(0, 10) })))
}

/** Grava (ou atualiza) as faturas fechadas do cartão. */
export async function gravarFaturasDoBanco(
  db: Db,
  orgId: string,
  accountId: string,
  faturas: readonly PolpCardBill[],
): Promise<void> {
  if (faturas.length === 0) return
  await db
    .insert(faturasDoBanco)
    .values(faturas.map((f) => ({
      orgId,
      accountId,
      billId: f.id,
      fechamento: diaEmSaoPaulo(f.bill_closing_date),
      vencimento: diaEmSaoPaulo(f.due_date),
      // O banco informa o que se deve como positivo; no floow é negativo.
      totalCents: -centavos(f.bill_total_amount.amount),
    })))
    .onConflictDoUpdate({
      target: [faturasDoBanco.accountId, faturasDoBanco.billId],
      set: {
        fechamento: sql`excluded.fechamento`,
        vencimento: sql`excluded.vencimento`,
        totalCents: sql`excluded.total_cents`,
        updatedAt: new Date(),
      },
    })
}
