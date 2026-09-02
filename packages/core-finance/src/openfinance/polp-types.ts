/**
 * Formato dos payloads da Polp (Celcoin v2) que a ingestão consome.
 *
 * Fonte: docs oficiais lidas em 2026-09-02
 *   https://polp.com.br/docs/celcoin/accounts/transactions
 *   https://polp.com.br/docs/celcoin/credit-cards/transactions
 *
 * Conta e cartão são endpoints diferentes com formatos diferentes — e a
 * diferença não é cosmética: a conta traz `type` (AccountTransactionType,
 * TED/PIX/BOLETO…), o cartão traz `transaction_type` (CreditCardTransactionType,
 * PAGAMENTO_FATURA/ESTORNO/…). São enums distintos em campos de nome parecido,
 * o que torna fácil escrever um normalizador só e errar nos dois.
 */

/** Valor monetário. `amount` é string decimal ("1500.00"), nunca número. */
export interface PolpAmount {
  amount: string
  currency: string
}

/** Contraparte enriquecida. Chega `null` até o job de enrichment concluir. */
export interface PolpCounterparty {
  name: string | null
  alias: string | null
  tax_id: string | null
  website_url: string | null
  logo_url: string | null
}

/** CreditDebitIndicator — a origem do sinal do valor. */
export type PolpCreditDebitType = 'CREDITO' | 'DEBITO'

/**
 * CompletedAuthorisedPaymentIndicator — só em transações de conta.
 *
 * `LANCAMENTO_FUTURO` é lançamento agendado que ainda não aconteceu, e
 * `TRANSACAO_PROCESSANDO` ainda pode não se efetivar. Nenhum dos dois é gasto
 * realizado.
 */
export type PolpPaymentIndicator =
  | 'TRANSACAO_EFETIVADA'
  | 'LANCAMENTO_FUTURO'
  | 'TRANSACAO_PROCESSANDO'

/** AccountTransactionType — o meio pelo qual o dinheiro se moveu. */
export type PolpAccountTransactionType =
  | 'TED'
  | 'DOC'
  | 'PIX'
  | 'TRANSFERENCIA_MESMA_INSTITUICAO'
  | 'BOLETO'
  | 'CONVENIO_ARRECADACAO'
  | 'PACOTE_TARIFA_SERVICOS'
  | 'TARIFA_SERVICOS_AVULSOS'
  | 'FOLHA_PAGAMENTO'
  | 'DEPOSITO'
  | 'SAQUE'
  | 'CARTAO'
  | 'ENCARGOS_JUROS_CHEQUE_ESPECIAL'
  | 'RENDIMENTO_APLIC_FINANCEIRA'
  | 'PORTABILIDADE_SALARIO'
  | 'APLICACAO_FINANCEIRA'
  | 'RESGATE_APLIC_FINANCEIRA'
  | 'OPERACAO_CREDITO'
  | 'TRANSFERENCIA_SALDO_RESERVADO'
  | 'OUTROS'

/**
 * CreditCardTransactionType. Pode vir `null` no caso extremo em que o Banco
 * Central não envia o campo — a ingestão trata como OUTROS, nunca quebra.
 */
export type PolpCardTransactionType =
  | 'PAGAMENTO'
  | 'PAGAMENTO_FATURA'
  | 'TARIFA'
  | 'OPERACOES_CREDITO_CONTRATADAS_CARTAO'
  | 'ESTORNO'
  | 'CASHBACK'
  | 'OUTROS'

/** GET /accounts/{account}/transactions */
export interface PolpAccountTransaction {
  id: string
  account_id: string
  transaction_name: string
  transaction_date_time: string
  type: PolpAccountTransactionType
  completed_authorised_payment_type: PolpPaymentIndicator
  credit_debit_type: PolpCreditDebitType
  transaction_amount: PolpAmount
  type_additional_info?: string | null
  partie_cnpj_cpf?: string | null
  counterparty?: PolpCounterparty | null
  category_ref?: string | null
  created_at: string
  updated_at: string
}

/** GET /credit-cards/{creditCard}/transactions */
export interface PolpCardTransaction {
  id: string
  credit_card_id: string
  identification_number: string
  transaction_name: string
  credit_debit_type: PolpCreditDebitType
  transaction_type: PolpCardTransactionType | null
  /** Valor em reais, já convertido pela Polp. É este que vale para o floow. */
  brazilian_amount: PolpAmount
  /** Valor na moeda original da compra. Igual ao brazilian_amount quando BRL. */
  amount: PolpAmount
  transaction_date_time: string
  /** AAAA-MM-DD, ou a sentinela '0001-01-01' enquanto não lançada em fatura. */
  bill_post_date: string
  /** AAAA-MM. Sempre preenchido, inclusive para parcelas futuras. */
  bill_forecast_date: string
  bill_id?: string | null
  payment_type?: string | null
  fee_type?: string | null
  other_credits_type?: string | null
  /** Número da parcela atual (1..N). */
  charge_identificator?: number | null
  /** Total de parcelas. */
  charge_number?: number | null
  payee_mcc?: number | null
  counterparty?: PolpCounterparty | null
  category_ref?: string | null
  created_at: string
  updated_at: string
}

/** Envelope de listagem paginada por cursor (500 itens por página). */
export interface PolpPage<T> {
  data: T[]
  links?: { next?: string | null; prev?: string | null }
  meta?: { per_page?: number; next_cursor?: string | null; prev_cursor?: string | null }
}

/** InstitutionType — define quais documentos o consentimento aceita. */
export type PolpInstitutionType = 'PERSONAL' | 'BUSINESS' | 'BOTH'

export type PolpInstitutionStatus = 'OPERATIONAL' | 'MAJOR_OUTAGE' | 'DEGRADED_PERFORMANCE'

/** GET /institutions */
export interface PolpInstitution {
  id: string
  name: string
  description: string | null
  logo_url: string | null
  status: PolpInstitutionStatus
  type: PolpInstitutionType
  /** Campos aceitos no POST /consents: 'cpf' e/ou 'cnpj'. */
  credentials: string[]
  updated_at: string
}

export type PolpConsentStatus = 'AWAITING_AUTHORIZATION' | 'AUTHORISED' | 'REJECTED' | 'EXPIRED'

/**
 * ConsentExecutionStatus. `PARTIAL_SUCCESS` NÃO é falha: os dados principais
 * já estão lá e a Polp retenta o enriquecimento sozinha. Tratar como erro
 * levaria a interface a esconder dado que existe.
 */
export type PolpConsentExecutionStatus = 'AWAITING_RESOURCES' | 'SUCCESS' | 'PARTIAL_SUCCESS'

export type PolpConsentFlag =
  | 'ERROR_PROCESSING_CATEGORIES'
  | 'ERROR_PROCESSING_COUNTERPARTIES'
  | 'PARTIALLY_UNAVAILABLE_RESOURCES'

/** Produtos atuais. Os valores legado (LOAN, FUND…) são normalizados pela API. */
export type PolpProduct =
  | 'ACCOUNT'
  | 'CREDIT_CARD_ACCOUNT'
  | 'CREDIT_OPERATIONS'
  | 'INVESTMENTS'
  | 'EXCHANGE'

/** POST /consents, GET /consents/{consent} */
export interface PolpConsent {
  id: string
  institution_id: string
  /** Campo livre de correlação. O floow manda o org_id — ver D3 da spec. */
  cliente_user_id: string | null
  status: PolpConsentStatus
  status_label?: string
  execution_status: PolpConsentExecutionStatus | null
  flags: PolpConsentFlag[]
  products: string[]
  url_to_authenticate: string | null
  url_to_authenticate_expires_at: string | null
  error?: unknown
  created_at: string
  updated_at: string
}

export type PolpResourceType =
  | 'ACCOUNT'
  | 'CREDIT_CARD_ACCOUNT'
  | 'LOAN'
  | 'FINANCING'
  | 'UNARRANGED_ACCOUNT_OVERDRAFT'
  | 'INVOICE_FINANCING'
  | 'BANK_FIXED_INCOME'
  | 'CREDIT_FIXED_INCOME'
  | 'VARIABLE_INCOME'
  | 'TREASURE_TITLE'
  | 'FUND'
  | 'EXCHANGE'

/**
 * ResourceStatus. `TEMPORARILY_UNAVAILABLE` não é fim: o recurso volta. Só
 * `UNAVAILABLE` indica encerramento — dizer ao usuário que a conta caiu no
 * primeiro caso é alarme falso.
 */
export type PolpResourceStatus =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'PENDING_AUTHORISATION'

/** GET /consents/{consent}/resources — sem paginação, lista completa. */
export interface PolpResource {
  type: PolpResourceType
  type_label?: string
  status: PolpResourceStatus
  status_label?: string
  /**
   * UUID local da Polp — a chave de roteamento do webhook. Vem `null` enquanto
   * o recurso não foi persistido, e nesse caso não há o que registrar ainda:
   * é preciso consultar de novo antes de aceitar dado daquele recurso.
   */
  resource_id: string | null
}
