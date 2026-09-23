import { eq } from 'drizzle-orm'
import { transactions } from '@floow/db'

/**
 * Só o lançamento que aconteceu conta como gasto contra teto de orçamento.
 *
 * Previsão de recorrência nasce com `balance_applied = false` e assim fica —
 * aberta (ainda não aconteceu) ou conciliada (o realizado do banco já está
 * somado; contá-la de novo dobra o gasto). É a mesma regra do saldo e do
 * fluxo de caixa desde 9ae90ed.
 *
 * Quem respeita: `getSpendingByCategory`, `getDailySpending`, o popup de
 * lançamentos do ritmo (`budget-pacing-actions.ts`) e o insight do CFO
 * (`budget-pacing-input.ts`). Os quatro precisam contar o mês igual.
 */
export const somenteRealizado = eq(transactions.balanceApplied, true)
