import { sql } from 'drizzle-orm'
import { accounts, transactions } from '@floow/db'
import { TIPOS_DE_INVESTIMENTO } from '@floow/core-finance'

/**
 * "Esta linha soma no saldo da listagem?", em SQL.
 *
 * A mesma regra de `contaNoSaldoProjetado` (lib/finance/projected-balance.ts),
 * que decide linha a linha no cliente. Aqui ela decide dentro das somas de
 * janela de `getTransactionsWithCount`, de onde sai o `startingBalance` de
 * cada pagina.
 *
 * As duas PRECISAM dizer a mesma coisa. Quando divergem, o saldo do topo da
 * pagina vem de uma regra e os incrementos de outra: a coluna inteira fica
 * errada e nada quebra. Mexeu numa, mexa na outra — `regra-de-saldo-sql.test.ts`
 * e `saldo-projetado.test.ts` descrevem os mesmos criterios de proposito.
 *
 * Os tres criterios:
 *
 *  1. Conta de investimento nao soma. A perna do aporte fica na lista, porque
 *     registra o dinheiro saindo da corrente e entrando na corretora, mas
 *     somar as duas anula o aporte.
 *  2. O que ja foi aplicado no saldo soma — e o realizado.
 *  3. Previsao AINDA POR VENCER soma: e a projecao, o que responde "como fecho
 *     o mes". Previsao vencida nao soma, porque dali em diante quem diz o que
 *     aconteceu e o extrato. Previsao ja casada tambem nao, porque quem soma
 *     nesse caso e o realizado.
 *
 * `hoje` entra como parametro, e nao `CURRENT_DATE`, para o fuso ser o de Sao
 * Paulo e nao o do servidor do banco.
 */
export function sqlContaNoSaldo(hoje: string) {
  return sql`(
    ${accounts.type} NOT IN ${TIPOS_DE_INVESTIMENTO}
    AND (
      ${transactions.balanceApplied}
      OR (
        ${transactions.matchedTransactionId} IS NULL
        AND ${transactions.date} > ${hoje}::date
      )
    )
  )`
}

/** O valor da linha quando ela soma, zero quando nao. */
export function sqlValorNoSaldo(hoje: string) {
  return sql`case when ${sqlContaNoSaldo(hoje)} then ${transactions.amountCents} else 0 end`
}
