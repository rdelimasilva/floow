/**
 * Payloads de investimento da Polp (Celcoin v2).
 *
 * Fonte: https://polp.com.br/docs/celcoin/ (seção Investimentos), 2026-09-23.
 * Os cinco tipos têm formatos parecidos e NÃO iguais — fundos chamam a
 * quantidade de `quota_quantity`, renda variável não tem valor líquido nem
 * IR, e a data de referência é `reference_date_time` em três tipos e
 * `reference_date` nos outros dois. Tudo que a doc marca como anulável está
 * como opcional aqui; o normalizador trata ausência como `null`, nunca zero.
 */

export type PolpInvestmentKind =
  | 'BANK_FIXED_INCOME'
  | 'CREDIT_FIXED_INCOME'
  | 'FUND'
  | 'TREASURE_TITLE'
  | 'VARIABLE_INCOME'

export const POLP_INVESTMENT_KINDS: readonly PolpInvestmentKind[] = [
  'BANK_FIXED_INCOME',
  'CREDIT_FIXED_INCOME',
  'FUND',
  'TREASURE_TITLE',
  'VARIABLE_INCOME',
]

/** `{ amount: "1500.00", currency: "BRL" }`. Algumas instituições mandam string solta. */
export type PolpMoney = { amount: string; currency?: string } | string

export interface PolpRemuneration {
  indexer?: string | null
  indexer_additional_info?: string | null
  rate_type?: string | null
  rate_periodicity?: string | null
  calculation?: string | null
  pre_fixed_rate?: string | null
  /** Escala diverge por tipo na doc: "1.000000" ou "100" para 100%. */
  post_fixed_indexer_percentage?: string | null
}

interface PolpInvestmentBase {
  id: string
  consent_id?: string
  isin_code?: string | null
  created_at?: string
  updated_at?: string
}

/** Balance de renda fixa bancária, crédito e Tesouro. */
export interface PolpFixedIncomeBalance {
  reference_date_time?: string | null
  quantity?: string | null
  updated_unit_price?: PolpMoney | null
  gross_amount?: PolpMoney | null
  net_amount?: PolpMoney | null
  income_tax?: PolpMoney | null
  financial_transaction_tax?: PolpMoney | null
  blocked_balance?: PolpMoney | null
  purchase_unit_price?: PolpMoney | null
}

export interface PolpBankFixedIncome extends PolpInvestmentBase {
  investment_type?: string | null
  issuer_institution_cnpj_number?: string | null
  due_date?: string | null
  issue_date?: string | null
  purchase_date?: string | null
  remuneration?: PolpRemuneration | null
  balance?: PolpFixedIncomeBalance | null
}

export interface PolpCreditFixedIncome extends PolpBankFixedIncome {
  debtor_cnpj_number?: string | null
  debtor_name?: string | null
  tax_exempt_product?: string | null
}

export interface PolpTreasureTitle extends PolpInvestmentBase {
  product_name?: string | null
  due_date?: string | null
  purchase_date?: string | null
  remuneration?: PolpRemuneration | null
  balance?: PolpFixedIncomeBalance | null
}

export interface PolpFund extends PolpInvestmentBase {
  name?: string | null
  cnpj_number?: string | null
  anbima_category?: string | null
  balance?: {
    reference_date?: string | null
    quota_quantity?: string | null
    quota_gross_price_value?: PolpMoney | null
    gross_amount?: PolpMoney | null
    net_amount?: PolpMoney | null
    income_tax_provision?: PolpMoney | null
    financial_transaction_tax_provision?: PolpMoney | null
    blocked_amount?: PolpMoney | null
  } | null
}

export interface PolpVariableIncome extends PolpInvestmentBase {
  ticker?: string | null
  issuer_institution_cnpj_number?: string | null
  balance?: {
    reference_date?: string | null
    quantity?: string | null
    closing_price?: PolpMoney | null
    gross_amount?: PolpMoney | null
    blocked_balance?: PolpMoney | null
  } | null
}

/** Movimentação — união dos campos dos cinco tipos. */
export interface PolpInvestmentTransaction {
  id: string
  type?: 'ENTRADA' | 'SAIDA' | string | null
  transaction_type?: string | null
  transaction_type_additional_info?: string | null
  /** Todos menos fundos. */
  transaction_date?: string | null
  /** Só fundos. */
  transaction_conversion_date?: string | null
  transaction_quantity?: string | null
  transaction_quota_quantity?: string | null
  transaction_unit_price?: PolpMoney | null
  transaction_quota_price?: PolpMoney | null
  transaction_value?: PolpMoney | null
  transaction_gross_value?: PolpMoney | null
  transaction_net_value?: PolpMoney | null
  income_tax?: PolpMoney | null
  financial_transaction_tax?: PolpMoney | null
}
