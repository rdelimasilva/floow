/**
 * Fachada das consultas de finanças.
 *
 * O arquivo tinha 590 linhas e cinco assuntos dentro — conta, transação,
 * categoria, fluxo de caixa, recorrência — e o limite do projeto é 500. Cada
 * assunto virou um módulo `queries-*.ts` ao lado, e isto aqui só reexporta:
 * uns 50 arquivos importam de `@/lib/finance/queries` e continuam importando.
 *
 * Quem for mexer, mexa no módulo; este arquivo é só o índice.
 */

/**
 * Org ativa do requisitante.
 *
 * A implementação vive em `@/lib/auth/session`, que deriva a org de um JWT com
 * assinatura verificada. Reexportado aqui porque ~50 arquivos já importam
 * `getOrgId` deste módulo.
 */
export { getOrgId } from '@/lib/auth/session'

export { getAccounts, getAccountById, getSaldosDoBanco } from './queries-accounts'

export {
  type TransactionFilterOpts,
  buildBalanceScopeConditions,
  buildTransactionConditions,
  buildTransactionOrder,
  contasDoFiltro,
  getTransactionsWithCount,
  getTransactionCount,
  hasAnyTransaction,
  getRecentTransactions,
  getFutureTransactions,
} from './queries-transactions'

export { getCategories, getCategoryUsageOrder, getCategoryRules } from './queries-categories'

export { getLatestSnapshot } from './queries-snapshots'

export {
  type MonthlyCashFlowSummary,
  getMonthlyCashFlowSummary,
  getFutureMonthlyCashFlowSummary,
} from './queries-cash-flow'

export { getRecurringTemplates, getUpcomingRecurring, getDatasDasParcelas } from './queries-recurring'
