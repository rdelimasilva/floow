import { sql } from 'drizzle-orm'
import { transactions } from '@floow/db'
import type { Db } from './persist-page'

/**
 * O lançamento que chega já dentro da fatura fechada ocupa a linha que ele
 * mesmo era na fatura aberta, em vez de entrar de novo.
 *
 * Quando a fatura fecha, a Polp reenvia os lançamentos com `bill_id`. Quase
 * sempre com o mesmo `external_id` — e o UPDATE por id resolve —, mas não
 * sempre: no fechamento do Visa PDA em 13/10, 7 dos 17 vieram com id novo, e
 * cada Facebook de 12–13/09 passou a pesar duas vezes na fatura. Diferem da
 * linha original só no id e nos campos da fatura; valor, data, descrição e
 * CNPJ são os mesmos.
 *
 * A linha ocupada é a que está na fatura aberta (`bill_id IS NULL`) com a
 * mesma data e valor. Duas compras iguais no mesmo dia continuam duas: cada
 * cópia ocupa uma linha, e a ocupada sai da busca porque ganha `bill_id`.
 * Compra que chega direto na fatura fechada não acha linha e entra normal.
 *
 * Fica de fora a linha cujo id veio nesta mesma página: se a fonte ainda manda
 * a versão aberta, as duas existem lá, e decidir é com o detector de
 * duplicata (R2), não com a importação.
 *
 * Saldo, categoria e data não mudam: a linha já estava no saldo do jeito
 * certo. Ela só ganha a fatura e o id novo, para o próximo sync reconhecê-la.
 */
export async function ocuparNaFaturaFechada(
  db: Db,
  input: {
    orgId: string
    accountId: string
    idsDaPagina: string[]
    tx: {
      externalId: string
      billId: string
      billPostDate: Date | null
      billForecastMonth: string | null
      date: string
      amountCents: number
      counterpartyTaxId: string | null
    }
  },
): Promise<boolean> {
  const { orgId, accountId, idsDaPagina, tx } = input
  const [row] = await db
    .update(transactions)
    .set({
      externalId: tx.externalId,
      billId: tx.billId,
      billPostDate: tx.billPostDate,
      billForecastMonth: tx.billForecastMonth,
    })
    .where(sql`${transactions.id} = (
      SELECT aberta.id FROM transactions AS aberta
      WHERE aberta.org_id = ${orgId}
        AND aberta.account_id = ${accountId}
        AND aberta.bill_id IS NULL
        AND aberta.external_id IS NOT NULL
        AND aberta.external_id NOT IN (${sql.join(idsDaPagina.map((id) => sql`${id}`), sql`, `)})
        AND aberta.is_installment_forecast = false
        AND aberta.is_ignored = false
        AND aberta.date = ${tx.date}::date
        AND aberta.amount_cents = ${tx.amountCents}
        AND (aberta.counterparty_tax_id IS NULL OR ${tx.counterpartyTaxId}::text IS NULL
             OR aberta.counterparty_tax_id = ${tx.counterpartyTaxId})
      ORDER BY aberta.created_at
      LIMIT 1
    )`)
    .returning({ id: transactions.id })

  return row !== undefined
}
