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
 * Mês da fatura pelo `bill_id`, para a parcela que chega sem data.
 *
 * Na virada da fatura de outubro do Master Black, Airbnb 3/6 e Diroma 3/5
 * vieram com `bill_post_date` igual à data da compra (fatura falsa, descartada
 * pelo normalizador) e sem `bill_forecast_date`. Sem nenhum dos dois, a
 * parcela ia para o dia da compra, em julho. O `bill_id` delas aponta a
 * fatura, e a fatura diz o vencimento.
 *
 * Só preenche o que falta: o mês que a própria transação traz vale mais.
 */
export function completarMesDaFatura<T extends Pick<NormalizedPolpTransaction, 'billId' | 'billForecastMonth'>>(
  tx: T,
  meses: ReadonlyMap<string, string>,
): T {
  if (tx.billForecastMonth || !tx.billId) return tx
  const mes = meses.get(tx.billId)
  return mes ? { ...tx, billForecastMonth: mes } : tx
}

export interface PagamentoDoBanco {
  /** Positivo: o pagamento entra no cartão. */
  amountCents: number
  date: string
}

/** Todo pagamento abatido de alguma fatura, com valor e dia. */
export function pagamentosDoBanco(faturas: readonly PolpCardBill[]): PagamentoDoBanco[] {
  return faturas.flatMap((f) => (f.payments ?? []).map((p) => ({ amountCents: centavos(p.amount), date: p.paymentDate.slice(0, 10) })))
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
