import { formatarDia } from '@/lib/formatar-dia'

export interface TransactionRowData {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amountCents: number
  description: string
  date: Date | string
  accountId: string
  categoryId?: string | null
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
  transferGroupId?: string | null
  externalId?: string | null
  isAutoCategorized?: boolean
  isIgnored?: boolean
  recurringTemplateId?: string | null
  balanceApplied?: boolean
  /**
   * `accounts.type` da conta deste lancamento. A coluna de saldo decide por
   * linha e precisa dele: lancamento de conta de investimento nao soma.
   */
  accountType?: string | null
  /**
   * Saldo APOS este lancamento, em ordem cronologica, calculado no servidor
   * sobre todos os lancamentos da conta — nao sobre os desta pagina. Ver
   * `buildBalanceScopeConditions`.
   */
  runningBalance?: number
  installmentNumber?: number | null
  installmentTotal?: number | null
  /** Data da compra, só em parcela de cartão. */
  purchaseDate?: Date | string | null
  counterpartyId?: string | null
  /** `pending` enquanto espera Classificar; ver `lib/finance/desconciliar.ts`. */
  reviewState?: string | null
  /** Realizado que alguma previsão aponta como cumprida. */
  cumprePrevisao?: boolean
  /**
   * O bem que este lancamento adquiriu, quando ha vinculo em
   * `fixed_assets.acquisition_transaction_id`. Vem por subquery e nao por
   * join: dois bens podem apontar o mesmo lancamento, e a duplicacao de linha
   * corromperia o `count(*) over ()` e a soma acumulada da listagem.
   */
  /**
   * Excecao de fluxo de caixa deste lancamento. `null`/ausente = herda da
   * categoria. Ver `lib/finance/affects-cash-flow-cycle.ts`.
   */
  /**
   * Preenchido no lancamento PREVISTO que ja foi cumprido pelo realizado.
   * Previsto com vinculo nunca entra no saldo.
   */
  matchedTransactionId?: string | null
  affectsCashFlow?: boolean | null
  /**
   * O que a CATEGORIA deste lancamento diz sobre fluxo de caixa.
   *
   * Viaja na linha porque o botao mostra a resposta que vale ("no fluxo" /
   * "fora do fluxo") e nao o mecanismo: sem isto, a linha sabia apenas que
   * herdava, e nao o que herdava. `null`/ausente = sem categoria, e o padrao
   * e contar.
   */
  categoryAffectsCashFlow?: boolean | null
  acquiredAssetId?: string | null
  acquiredAssetName?: string | null
  /**
   * Há proposta de conciliação esperando decisão para esta previsão.
   *
   * Muda o selo: o vermelho "não conciliado" quer dizer "exige decisão sua", e
   * com proposta aberta a decisão está na fila.
   *
   * Muda também a coluna de saldo. O realizado que a proposta aponta já
   * entrou, e o vínculo só é gravado na aprovação — somar as duas linhas
   * contaria o mesmo dinheiro duas vezes. Ver `contaNoSaldoProjetado`.
   */
  hasPendingMatchProposal?: boolean
}

export interface AccountOption {
  id: string
  name: string
}

export interface CategoryOption {
  id: string
  name: string
  type: string
}

/**
 * A cor do valor segue o SINAL, não o tipo.
 *
 * Seguia o tipo antes — `income` verde, `expense` vermelho, `transfer` azul.
 * Com 806 despesas (todas negativas) e 66 transferências negativas, a coluna
 * mostrava o mesmo sinal em duas cores, vermelho e azul lado a lado: a cor
 * codificava tipo e o leitor lia sinal.
 *
 * Transferência que sai da conta é dinheiro saindo daquela conta, igual a
 * despesa, e o saldo trata as duas do mesmo jeito. Que seja transferência já
 * está dito na coluna de tipo.
 */
export function amountColorClass(amountCents: number): string {
  if (amountCents < 0) return 'text-red-600'
  if (amountCents > 0) return 'text-green-700'
  return 'text-gray-500'
}

export const TYPE_LABELS = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
} as const

/** Dia do lançamento (coluna `date`) — ver `formatarDia`. */
export function formatDate(date: Date | string): string {
  return formatarDia(date)
}

export function toDateInputValue(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0]
}
