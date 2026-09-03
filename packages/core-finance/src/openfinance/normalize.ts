/**
 * Conversão de uma transação da Polp para o modelo do floow.
 *
 * Função pura: recebe o payload cru e devolve os campos que a ingestão grava.
 * Toda a aritmética de valor, sinal e data mora aqui, e só aqui — espalhar
 * `parseFloat(x) * 100` pelo código é como se perde centavo em canto escuro.
 *
 * Ver docs/superpowers/specs/2026-09-02-openfinance-ingestion-design.md
 */
import { kindForRef } from './taxonomy'
import type {
  PolpAccountTransaction,
  PolpAccountTransactionType,
  PolpCardTransaction,
  PolpCounterparty,
} from './polp-types'

/** O que a ingestão grava em `transactions`. */
export interface NormalizedPolpTransaction {
  /** `id` da Polp — dedupe pelo índice único (external_id, account_id). */
  externalId: string
  /** AAAA-MM-DD, regime de competência: é o que o pacing usa. */
  date: string
  /** Convenção do floow: despesa negativa, receita positiva. */
  amountCents: number
  type: 'income' | 'expense' | 'transfer'
  description: string
  /** `category_ref` cru, guardado mesmo já mapeado: permite recategorizar depois. */
  categoryRef: string | null
  /**
   * `type` cru da Polp (AccountTransactionType). Null em transação de cartão:
   * `transaction_type` do cartão é OUTRO enum (PAGAMENTO_FATURA, ESTORNO,
   * CASHBACK), já consumido inteiro por `cardType()`. Guardar os dois no mesmo
   * campo criaria exatamente a confusão que o cabeçalho de `polp-types.ts`
   * avisa: dois enums distintos em campos de nome parecido.
   */
  polpType: string | null
  payeeMcc: number | null
  /** Null enquanto a compra não foi lançada em fatura. */
  billPostDate: string | null
  /** AAAA-MM. Mês de faturamento, inclusive de parcela ainda não lançada. */
  billForecastMonth: string | null
  installmentNumber: number | null
  installmentTotal: number | null
  /**
   * `scheduled` e `processing` NÃO são gasto realizado: o primeiro é lançamento
   * agendado que ainda não aconteceu, o segundo ainda pode não se efetivar.
   * Quem decide o que fazer com eles é a ingestão; aqui só não se perde o fato.
   */
  settlement: 'settled' | 'scheduled' | 'processing'
  /** Valor na moeda original, quando a compra não foi em BRL. */
  foreign: { amountCents: number; currency: string } | null
}

/** Data-sentinela que a Celcoin usa para "ainda não lançada em fatura". */
const NO_BILL_SENTINEL = '0001-01-01'

/**
 * A Polp manda valor como string decimal ("1500.00"), e a conversão óbvia
 * (`parseFloat(x) * 100`) erra: 8149.51 * 100 dá 814950.9999999999, que
 * truncado vira um centavo a menos. Aqui a conta é feita sobre os dígitos, sem
 * passar por ponto flutuante em momento algum.
 *
 * O sinal do texto é preservado, mas quem manda na direção do dinheiro é
 * `credit_debit_type` — ver `signedAmount`.
 */
export function parseAmountCents(value: string): number {
  const m = /^\s*(-)?(\d+)(?:\.(\d+))?\s*$/.exec(value)
  if (!m) {
    throw new Error(`valor monetário inválido vindo da Polp: ${JSON.stringify(value)}`)
  }

  const [, sign, whole, frac = ''] = m
  let cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2))

  // Terceira casa decimal existe em conversão de moeda; arredonda para cima a
  // partir de 5, como o resto do sistema.
  const third = frac[2]
  if (third !== undefined && Number(third) >= 5) cents += 1

  if (!Number.isSafeInteger(cents)) {
    throw new Error(`valor monetário fora da faixa segura: ${JSON.stringify(value)}`)
  }

  return sign ? -cents : cents
}

const SAO_PAULO_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * `transaction_date_time` ISO 8601 para a data de competência AAAA-MM-DD.
 *
 * Uma compra às 22h de 31 de janeiro em Brasília chega como
 * "2026-01-31T22:00:00-03:00", que em UTC já é 1º de fevereiro. Fatiar os dez
 * primeiros caracteres do valor convertido para UTC jogaria o gasto para o mês
 * seguinte e furaria o orçamento de janeiro — por isso a conversão é explícita
 * para America/Sao_Paulo.
 *
 * Quando a string não traz fuso nenhum, não há o que converter: a data já é a
 * data, e inventar um deslocamento é que criaria o erro.
 */
export function toCompetenceDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    throw new Error(`data inválida vinda da Polp: ${JSON.stringify(iso)}`)
  }

  const hasZone = /([Zz]|[+-]\d{2}:?\d{2})$/.test(iso.slice(10))
  if (!hasZone) return iso.slice(0, 10)

  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`data inválida vinda da Polp: ${JSON.stringify(iso)}`)
  }

  return SAO_PAULO_DATE.format(parsed)
}

/**
 * `alias` é o nome fantasia ("Netflix"), muito melhor que o
 * `transaction_name` cru ("NETFLIX.COM 4085 SAO PAULO BR"). Chega
 * assincronamente, então o import precisa ser idempotente: a mesma transação
 * volta depois com a contraparte preenchida e a descrição melhora.
 */
function describe(transactionName: string, counterparty: PolpCounterparty | null | undefined): string {
  const candidate =
    counterparty?.alias?.trim() || transactionName?.trim() || counterparty?.name?.trim() || ''

  return candidate.replace(/\s+/g, ' ') || 'Transação sem descrição'
}

/** Módulo do valor com o sinal que a direção do dinheiro determina. */
function signedAmount(value: string, direction: 'CREDITO' | 'DEBITO'): number {
  const cents = Math.abs(parseAmountCents(value))
  return direction === 'CREDITO' ? cents : -cents
}

function billPostDateOrNull(raw: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  // A sentinela é repassada crua pela Polp. Gravá-la como data real põe o
  // lançamento no ano 1 e ele some de qualquer filtro por período.
  if (raw === NO_BILL_SENTINEL || raw.startsWith('0001-')) return null
  return raw
}

function forecastMonthOrNull(raw: string | null | undefined): string | null {
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : null
}

function installments(current: number | null | undefined, total: number | null | undefined) {
  // Parcelamento só existe com mais de uma parcela; `charge_number` vem null ou
  // 1 na compra à vista, e gravar "parcela 1 de 1" polui a interface.
  if (!total || total <= 1) return { installmentNumber: null, installmentTotal: null }
  return { installmentNumber: current ?? null, installmentTotal: total }
}

export interface AccountNormalizeOptions {
  /**
   * Há cartão de crédito conectado nesta org?
   *
   * Muda o significado do pagamento de fatura que aparece na conta corrente. Se
   * o cartão está conectado, as compras já entraram uma a uma e contar o
   * pagamento da fatura conta o mesmo dinheiro duas vezes — vira transferência.
   * Se não está, o pagamento é o único registro daquele gasto e precisa contar
   * como despesa, senão o mês inteiro de cartão desaparece do orçamento.
   */
  creditCardConnected?: boolean
}

/**
 * Natureza que o `type` do Banco Central determina sozinho, ou `undefined`
 * quando ele não desempata.
 *
 * Tem precedência sobre o `category_ref` de propósito: quando os dois
 * discordam, é o `category_ref` que erra. `Aplicação CDB DI` chegou rotulada
 * `OTHER` e jogou R$ 125 mil em "despesa", enquanto `Saída APLICACAO CDB DI` —
 * a mesma operação, na mesma conta — veio rotulada como transferência. O enum
 * do BCB não tem essa ambiguidade.
 *
 * `PIX`, `TED`, `OUTROS` e a maioria dos outros valores não dizem nada sobre
 * ser gasto ou movimentação, e caem no `undefined`.
 */
function natureFromPolpType(
  type: PolpAccountTransactionType | null | undefined,
): NormalizedPolpTransaction['type'] | undefined {
  switch (type) {
    case 'APLICACAO_FINANCEIRA':
    case 'RESGATE_APLIC_FINANCEIRA':
    case 'TRANSFERENCIA_SALDO_RESERVADO':
      return 'transfer'

    // Rendimento é dinheiro novo, ao contrário do resgate — que é dinheiro que
    // já era do usuário voltando para a conta.
    case 'RENDIMENTO_APLIC_FINANCEIRA':
      return 'income'

    default:
      return undefined
  }
}

/** Transação de conta bancária (GET /accounts/{account}/transactions). */
export function normalizeAccountTransaction(
  tx: PolpAccountTransaction,
  options: AccountNormalizeOptions = {},
): NormalizedPolpTransaction {
  const categoryRef = tx.category_ref ?? null
  const amountCents = signedAmount(tx.transaction_amount.amount, tx.credit_debit_type)

  const isCardBillPayment = categoryRef === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
  const type: NormalizedPolpTransaction['type'] =
    natureFromPolpType(tx.type) ??
    (kindForRef(categoryRef ?? '') === 'transfer' ||
    (isCardBillPayment && options.creditCardConnected === true)
      ? 'transfer'
      : tx.credit_debit_type === 'CREDITO'
        ? 'income'
        : 'expense')

  const settlement =
    tx.completed_authorised_payment_type === 'LANCAMENTO_FUTURO'
      ? 'scheduled'
      : tx.completed_authorised_payment_type === 'TRANSACAO_PROCESSANDO'
        ? 'processing'
        : 'settled'

  return {
    externalId: tx.id,
    date: toCompetenceDate(tx.transaction_date_time),
    amountCents,
    type,
    description: describe(tx.transaction_name, tx.counterparty),
    categoryRef,
    polpType: tx.type ?? null,
    payeeMcc: null,
    billPostDate: null,
    billForecastMonth: null,
    installmentNumber: null,
    installmentTotal: null,
    settlement,
    foreign: null,
  }
}

/** Transação de cartão de crédito (GET /credit-cards/{creditCard}/transactions). */
export function normalizeCardTransaction(tx: PolpCardTransaction): NormalizedPolpTransaction {
  const categoryRef = tx.category_ref ?? null
  // `brazilian_amount` já vem convertido pela Polp; `amount` é a moeda da compra.
  const amountCents = signedAmount(tx.brazilian_amount.amount, tx.credit_debit_type)

  const foreign =
    tx.amount && tx.amount.currency !== tx.brazilian_amount.currency
      ? { amountCents: Math.abs(parseAmountCents(tx.amount.amount)), currency: tx.amount.currency }
      : null

  return {
    externalId: tx.id,
    date: toCompetenceDate(tx.transaction_date_time),
    amountCents,
    type: cardType(tx, categoryRef),
    description: describe(tx.transaction_name, tx.counterparty),
    categoryRef,
    polpType: null,
    payeeMcc: tx.payee_mcc ?? null,
    billPostDate: billPostDateOrNull(tx.bill_post_date),
    billForecastMonth: forecastMonthOrNull(tx.bill_forecast_date),
    ...installments(tx.charge_identificator, tx.charge_number),
    // A fatura ainda não fechada não torna a compra menos real: o gasto
    // aconteceu na data da compra, que é o regime que o pacing usa.
    settlement: 'settled',
    foreign,
  }
}

function cardType(tx: PolpCardTransaction, categoryRef: string | null): NormalizedPolpTransaction['type'] {
  switch (tx.transaction_type) {
    // O pagamento da fatura não é gasto: as compras que ele quita já entraram
    // uma a uma. Contá-lo dobra o mês inteiro de cartão.
    case 'PAGAMENTO_FATURA':
      return 'transfer'

    // Estorno é despesa NEGATIVA, não receita. A agregação de gasto soma
    // -amount_cents sobre type='expense'; como estorno vem CREDITO (valor
    // positivo), tipá-lo assim faz o dinheiro devolvido abater a categoria em
    // que foi gasto. Como 'income' ele não tocaria o orçamento, e o teto
    // continuaria estourado por uma compra que foi desfeita.
    case 'ESTORNO':
      return 'expense'

    // Cashback é dinheiro que entra, sem compra correspondente para abater.
    case 'CASHBACK':
      return 'income'

    default:
      // `transaction_type` null acontece quando o BCB não envia o campo — cai
      // aqui e é tratado pelo crédito/débito, como qualquer outra.
      if (kindForRef(categoryRef ?? '') === 'transfer') return 'transfer'
      return tx.credit_debit_type === 'CREDITO' ? 'income' : 'expense'
  }
}
