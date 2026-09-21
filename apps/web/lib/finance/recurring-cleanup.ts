import { and, eq, isNull, sql } from 'drizzle-orm'
import { transactions } from '@floow/db'

/**
 * As parcelas que ainda não venceram. Cancelar a recorrência sempre as leva:
 * são previsão de um template que deixou de valer.
 */
export function condicoesDeParcelasFuturas(orgId: string, templateId: string, hojeStr: string) {
  return [
    eq(transactions.orgId, orgId),
    eq(transactions.recurringTemplateId, templateId),
    sql`${transactions.date} > ${hojeStr}::date`,
  ]
}

/**
 * As parcelas cuja data passou e que o banco nunca confirmou.
 *
 * Ficavam para trás para sempre: `cancelRecurring` só apagava o futuro, elas
 * não entram em `accounts.balance_cents` nem no saldo projetado, e com o
 * template já desativado nem o próprio cancelamento as alcançava de novo —
 * sobrava apagar uma a uma.
 *
 * O recorte é estreito porque apagar lançamento é irreversível:
 *
 *   - `balance_applied = false`: linha que está dentro de um saldo não se
 *     apaga em varredura. Apagá-la exigiria reverter dinheiro, e a limpeza
 *     deixaria o saldo da conta errado.
 *   - `matched_transaction_id IS NULL`: a previsão casada é o registro de que
 *     o realizado cumpriu aquela parcela. Não é lixo.
 */
export function condicoesDeParcelasVencidasNaoConciliadas(
  orgId: string,
  templateId: string,
  hojeStr: string,
) {
  return [
    eq(transactions.orgId, orgId),
    eq(transactions.recurringTemplateId, templateId),
    eq(transactions.balanceApplied, false),
    isNull(transactions.matchedTransactionId),
    sql`${transactions.date} <= ${hojeStr}::date`,
  ]
}

/** Açúcar para quem só quer a cláusula pronta. */
export const whereParcelasFuturas = (orgId: string, templateId: string, hojeStr: string) =>
  and(...condicoesDeParcelasFuturas(orgId, templateId, hojeStr))

export const whereParcelasVencidasNaoConciliadas = (
  orgId: string,
  templateId: string,
  hojeStr: string,
) => and(...condicoesDeParcelasVencidasNaoConciliadas(orgId, templateId, hojeStr))
