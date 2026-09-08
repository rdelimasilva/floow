import { sql } from 'drizzle-orm'
import { transactions, categories } from '@floow/db'

/**
 * O `affects_cash_flow` efetivo de um lançamento, como condição SQL.
 *
 * Precedência: o valor do próprio lançamento manda quando preenchido; o da
 * categoria é o padrão; `true` cobre lançamento sem categoria — o left join
 * devolve NULL nos dois lados e o default tem que ser o comportamento
 * anterior, contar.
 *
 * **Exige `leftJoin(categories, eq(categories.id, transactions.categoryId))`
 * na query.** Sem o join, `categories.affects_cash_flow` não está no escopo e
 * o Postgres recusa a consulta.
 *
 * Existe como constante para os consumidores não divergirem. Quem respeita:
 * `getSpendingByCategory` e `getDailySpending` (aplicação em investimento não
 * é gasto e não deve consumir teto de orçamento) e o motor do CFO (o
 * consultor não deve chamar aplicação de "gasto").
 *
 * Quem NÃO respeita, de propósito:
 *
 * - `getInvestmentContributions` — soma transferências positivas para conta de
 *   investimento, e transferência já é neutra no fluxo de caixa. Aplicar aqui
 *   zeraria a métrica de meta de investimentos.
 * - `debt-queries` — a parcela foi paga de verdade. Tirá-la do rastreio de
 *   dívida faria a dívida parecer não amortizada.
 *
 * A agregação mensal em `queries.ts` repete esta regra em SQL cru, porque
 * aquela query é escrita à mão; qualquer mudança aqui tem que ir lá também.
 */
export const effectiveAffectsCashFlow = sql`coalesce(${transactions.affectsCashFlow}, ${categories.affectsCashFlow}, true)`
