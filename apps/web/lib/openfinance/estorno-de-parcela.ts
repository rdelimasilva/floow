import { sql, type SQL } from 'drizzle-orm'
import { transactions } from '@floow/db'
import type { Db } from './persist-page'

/**
 * Parcela cancelada no cartão.
 *
 * O Itaú cancela a compra parcelada com um crédito por parcela ("CANC
 * PARCELA SEM J03/12"), com a mesma data de compra, o mesmo n/total e o mesmo
 * valor da parcela. O normalizador já faz desse crédito uma despesa positiva,
 * que abate o gasto. Aqui ele herda a categoria da parcela, para abater na
 * categoria certa. O crédito que entrou antes dessa regra, como receita
 * pendente, vira despesa confirmada e sai da fila. O tipo muda e o valor não,
 * então o saldo continua igual.
 *
 * Receita que o usuário confirmou fica como está.
 */
export async function estornarParcelasCanceladas(db: Db, orgId: string, accountId: string): Promise<number> {
  const linhas = await db.execute(sql`
    UPDATE transactions AS c
    SET type = 'expense',
        review_state = 'confirmed',
        category_id = COALESCE(c.category_id, p.category_id),
        is_auto_categorized = c.is_auto_categorized OR (c.category_id IS NULL AND p.category_id IS NOT NULL)
    FROM transactions AS p
    WHERE c.org_id = ${orgId}
      AND c.account_id = ${accountId}
      AND c.amount_cents > 0
      AND c.installment_total > 1
      AND c.purchase_date IS NOT NULL
      AND (
        (c.type = 'income' AND c.review_state = 'pending')
        OR (c.type = 'expense' AND c.category_id IS NULL AND p.category_id IS NOT NULL)
      )
      AND p.org_id = c.org_id
      AND p.account_id = c.account_id
      AND p.purchase_date = c.purchase_date
      AND p.installment_total = c.installment_total
      AND p.installment_number = c.installment_number
      AND p.amount_cents = -c.amount_cents
      AND p.is_ignored = false
    RETURNING c.id
  `)
  return linhas.length
}

/**
 * A parcela não foi cancelada: não há crédito da mesma compra, do mesmo n/total
 * e do mesmo valor no cartão. Compra cancelada não é dívida, mesmo quando o
 * banco segue mandando as parcelas futuras.
 */
export const parcelaNaoEstornada: SQL = sql`NOT EXISTS (
  SELECT 1 FROM transactions AS estorno
  WHERE estorno.account_id = ${transactions.accountId}
    AND estorno.purchase_date = ${transactions.purchaseDate}
    AND estorno.installment_total = ${transactions.installmentTotal}
    AND estorno.installment_number = ${transactions.installmentNumber}
    AND estorno.amount_cents = -${transactions.amountCents}
    AND estorno.is_ignored = false
)`
