import { sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { accounts, forecastMatchProposals, transactions } from '@floow/db'
import { TIPOS_DE_INVESTIMENTO } from '@floow/core-finance'

/**
 * As tabelas que a regra le. Parametrizado porque o saldo acumulado e uma
 * subquery correlacionada sobre a MESMA tabela da consulta externa, e sem
 * alias proprio o `sum` interno leria as colunas da linha de fora.
 */
type Refs = {
  tx: {
    /**
     * Precisa vir junto porque a regra correlaciona uma subconsulta em
     * `forecast_match_proposals` com a linha: "existe proposta aberta para
     * ESTA previsao?".
     */
    id: AnyPgColumn
    balanceApplied: AnyPgColumn
    matchedTransactionId: AnyPgColumn
    date: AnyPgColumn
    amountCents: AnyPgColumn
  }
  acc: { type: AnyPgColumn }
}

const PADRAO: Refs = { tx: transactions, acc: accounts }

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
 * Os criterios:
 *
 *  1. Conta de investimento nao soma. A perna do aporte fica na lista, porque
 *     registra o dinheiro saindo da corrente e entrando na corretora, mas
 *     somar as duas anula o aporte.
 *  2. O que ja foi aplicado no saldo soma — e o realizado.
 *  3. Previsao AINDA POR VENCER soma: e a projecao, o que responde "como fecho
 *     o mes". Previsao vencida nao soma, porque dali em diante quem diz o que
 *     aconteceu e o extrato. Previsao ja casada tambem nao, porque quem soma
 *     nesse caso e o realizado.
 *  4. Previsao com proposta de conciliacao ABERTA nao soma. O realizado que a
 *     proposta aponta ja entrou no saldo, e o vinculo so e gravado quando o
 *     usuario aprova na fila: e o salario adiantado — previsao de R$ 32.500 no
 *     dia 15, o banco credita R$ 32.638,85 no dia 13 porque o dia 15 caiu no
 *     sabado, hoje e 14. Somar as duas linhas conta o mesmo dinheiro duas
 *     vezes.
 *
 * Os parenteses do `NOT EXISTS` vao escritos no template. O `notExists()` do
 * drizzle so os adiciona sozinho quando recebe um query builder — com
 * fragmento cru o Postgres recusaria a consulta inteira, e nenhum teste com
 * `db` mockado pegaria isso.
 *
 * `hoje` entra como parametro, e nao `CURRENT_DATE`, para o fuso ser o de Sao
 * Paulo e nao o do servidor do banco.
 */
export function sqlContaNoSaldo(hoje: string, refs: Refs = PADRAO) {
  return sql`(
    ${refs.acc.type} NOT IN ${TIPOS_DE_INVESTIMENTO}
    AND (
      ${refs.tx.balanceApplied}
      OR (
        ${refs.tx.matchedTransactionId} IS NULL
        AND ${refs.tx.date} > ${hoje}::date
        AND NOT EXISTS (select 1 from ${forecastMatchProposals}
           where ${forecastMatchProposals.forecastTransactionId} = ${refs.tx.id}
             and ${forecastMatchProposals.status} = 'pending')
      )
    )
  )`
}

/** O valor da linha quando ela soma, zero quando nao. */
export function sqlValorNoSaldo(hoje: string, refs: Refs = PADRAO) {
  return sql`case when ${sqlContaNoSaldo(hoje, refs)} then ${refs.tx.amountCents} else 0 end`
}
