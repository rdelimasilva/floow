import { describe, expect, it } from 'vitest'
import {
  normalizeAccountTransaction,
  normalizeCardTransaction,
  parseAmountCents,
  toCompetenceDate,
} from '../../openfinance/normalize'
import type { PolpAccountTransaction, PolpCardTransaction } from '../../openfinance/polp-types'

function accountTx(overrides: Partial<PolpAccountTransaction> = {}): PolpAccountTransaction {
  return {
    id: 'tx-1',
    account_id: 'acc-1',
    transaction_name: 'PIX ENVIADO',
    transaction_date_time: '2026-09-02T10:00:00-03:00',
    type: 'PIX',
    completed_authorised_payment_type: 'TRANSACAO_EFETIVADA',
    credit_debit_type: 'DEBITO',
    transaction_amount: { amount: '150.00', currency: 'BRL' },
    counterparty: null,
    category_ref: 'FOOD_AND_DRINK_RESTAURANT',
    created_at: '2026-09-02T10:05:00-03:00',
    updated_at: '2026-09-02T10:05:00-03:00',
    ...overrides,
  }
}

function cardTx(overrides: Partial<PolpCardTransaction> = {}): PolpCardTransaction {
  return {
    id: 'ctx-1',
    credit_card_id: 'card-1',
    identification_number: '1234',
    transaction_name: 'NETFLIX.COM 4085 SAO PAULO BR',
    credit_debit_type: 'DEBITO',
    transaction_type: 'PAGAMENTO',
    brazilian_amount: { amount: '59.90', currency: 'BRL' },
    amount: { amount: '59.90', currency: 'BRL' },
    transaction_date_time: '2026-09-02T20:00:00-03:00',
    bill_post_date: '2026-09-10',
    bill_forecast_date: '2026-09',
    counterparty: null,
    category_ref: 'ENTERTAINMENT_TV_AND_MOVIES',
    created_at: '2026-09-02T21:00:00-03:00',
    updated_at: '2026-09-02T21:00:00-03:00',
    ...overrides,
  }
}

describe('parseAmountCents', () => {
  it('converte a string decimal da Polp sem passar por ponto flutuante', () => {
    expect(parseAmountCents('1500.00')).toBe(150000)
    expect(parseAmountCents('0.01')).toBe(1)
    expect(parseAmountCents('1500')).toBe(150000)
  })

  it('não perde o centavo que parseFloat perderia', () => {
    // 8149.51 * 100 === 814950.9999999999 em ponto flutuante; truncado, some um
    // centavo. O erro é pequeno uma vez e sistemático no extrato inteiro.
    expect(parseAmountCents('8149.51')).toBe(814951)
    expect(parseAmountCents('1.005')).toBe(101)
  })

  it('recusa formato que não é o da Polp, em vez de devolver NaN', () => {
    // NaN entraria no banco como valor e só apareceria no saldo errado.
    expect(() => parseAmountCents('R$ 1.500,00')).toThrow(/inválido/)
    expect(() => parseAmountCents('1,50')).toThrow(/inválido/)
    expect(() => parseAmountCents('')).toThrow(/inválido/)
  })
})

describe('toCompetenceDate', () => {
  it('mantém a data local de Brasília numa compra de fim de noite', () => {
    // 22h de 31/01 em Brasília já é 01/02 em UTC. Fatiar o ISO em UTC jogaria o
    // gasto para o mês seguinte e furaria o orçamento de janeiro.
    expect(toCompetenceDate('2026-01-31T22:00:00-03:00')).toBe('2026-01-31')
    expect(toCompetenceDate('2026-02-01T01:00:00Z')).toBe('2026-01-31')
  })

  it('não inventa deslocamento quando a string não tem fuso', () => {
    expect(toCompetenceDate('2026-09-02T23:30:00')).toBe('2026-09-02')
  })

  it('recusa data que não é data', () => {
    expect(() => toCompetenceDate('ontem')).toThrow(/inválida/)
  })
})

describe('normalizeAccountTransaction', () => {
  it('usa credit_debit_type para o sinal, não o sinal do número', () => {
    expect(normalizeAccountTransaction(accountTx()).amountCents).toBe(-15000)
    expect(
      normalizeAccountTransaction(accountTx({ credit_debit_type: 'CREDITO', category_ref: 'INCOME_SALARY' }))
        .amountCents,
    ).toBe(15000)
  })

  it('não conta aporte em poupança como despesa', () => {
    // TRANSFER_OUT_SAVINGS é dinheiro que só mudou de lugar. Tratado pelo
    // débito, inflaria o orçamento com um gasto que não existiu.
    const t = normalizeAccountTransaction(accountTx({ category_ref: 'TRANSFER_OUT_SAVINGS' }))
    expect(t.type).toBe('transfer')
    expect(t.amountCents).toBe(-15000)
  })

  it('conta o pagamento de fatura como despesa quando o cartão não está conectado', () => {
    // Sem o cartão conectado, este pagamento é o único registro daquele gasto.
    const t = normalizeAccountTransaction(accountTx({ category_ref: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' }))
    expect(t.type).toBe('expense')
  })

  it('vira transferência quando o cartão está conectado', () => {
    // Com o cartão conectado as compras já entraram uma a uma; contar o
    // pagamento da fatura dobraria o mês inteiro.
    const t = normalizeAccountTransaction(accountTx({ category_ref: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' }), {
      creditCardConnected: true,
    })
    expect(t.type).toBe('transfer')
  })

  it('marca lançamento agendado como não realizado', () => {
    const t = normalizeAccountTransaction(
      accountTx({ completed_authorised_payment_type: 'LANCAMENTO_FUTURO' }),
    )
    expect(t.settlement).toBe('scheduled')
  })

  it('prefere o nome fantasia da contraparte à descrição crua do banco', () => {
    const t = normalizeAccountTransaction(
      accountTx({
        transaction_name: 'NETFLIX.COM   4085  SAO PAULO BR',
        counterparty: {
          name: 'NETFLIX ENTRETENIMENTO BRASIL LTDA.',
          alias: 'Netflix',
          tax_id: '13487809000140',
          website_url: null,
          logo_url: null,
        },
      }),
    )
    expect(t.description).toBe('Netflix')
  })

  it('cai para a descrição do banco enquanto o enrichment não rodou', () => {
    // counterparty chega null na primeira resposta e preenchida depois — por
    // isso o import precisa ser idempotente e capaz de atualizar.
    expect(normalizeAccountTransaction(accountTx()).description).toBe('PIX ENVIADO')
  })
})

describe('normalizeCardTransaction', () => {
  it('não conta o pagamento da fatura como gasto', () => {
    const t = normalizeCardTransaction(
      cardTx({ transaction_type: 'PAGAMENTO_FATURA', credit_debit_type: 'CREDITO' }),
    )
    expect(t.type).toBe('transfer')
  })

  it('faz o estorno abater a categoria em que se gastou', () => {
    // A agregação de gasto soma -amount_cents sobre type='expense'. Estorno vem
    // CREDITO (valor positivo); como 'expense' ele subtrai do gasto. Como
    // 'income' não tocaria o orçamento, e o teto seguiria estourado por uma
    // compra desfeita.
    const t = normalizeCardTransaction(
      cardTx({ transaction_type: 'ESTORNO', credit_debit_type: 'CREDITO' }),
    )
    expect(t.type).toBe('expense')
    expect(t.amountCents).toBe(5990)
  })

  it('trata cashback como receita, não como gasto negativo', () => {
    const t = normalizeCardTransaction(
      cardTx({ transaction_type: 'CASHBACK', credit_debit_type: 'CREDITO' }),
    )
    expect(t.type).toBe('income')
    expect(t.amountCents).toBe(5990)
  })

  it('não quebra quando o BCB não envia o tipo', () => {
    const t = normalizeCardTransaction(cardTx({ transaction_type: null }))
    expect(t.type).toBe('expense')
  })

  it('converte a data-sentinela de fatura em null', () => {
    // '0001-01-01' gravada crua põe o lançamento no ano 1, onde ele some de
    // qualquer filtro por período.
    const t = normalizeCardTransaction(cardTx({ bill_post_date: '0001-01-01', bill_forecast_date: '2026-12' }))
    expect(t.billPostDate).toBeNull()
    expect(t.billForecastMonth).toBe('2026-12')
  })

  it('guarda a parcela só quando há parcelamento', () => {
    const parcelada = normalizeCardTransaction(cardTx({ charge_identificator: 3, charge_number: 12 }))
    expect(parcelada.installmentNumber).toBe(3)
    expect(parcelada.installmentTotal).toBe(12)

    const aVista = normalizeCardTransaction(cardTx({ charge_identificator: 1, charge_number: 1 }))
    expect(aVista.installmentNumber).toBeNull()
    expect(aVista.installmentTotal).toBeNull()
  })

  it('usa o valor em reais e preserva a moeda original da compra', () => {
    const t = normalizeCardTransaction(
      cardTx({
        brazilian_amount: { amount: '542.30', currency: 'BRL' },
        amount: { amount: '99.90', currency: 'USD' },
      }),
    )
    expect(t.amountCents).toBe(-54230)
    expect(t.foreign).toEqual({ amountCents: 9990, currency: 'USD' })
  })

  it('não inventa moeda estrangeira em compra nacional', () => {
    expect(normalizeCardTransaction(cardTx()).foreign).toBeNull()
  })

  it('carrega o MCC para servir de desempate na categorização', () => {
    expect(normalizeCardTransaction(cardTx({ payee_mcc: 5812 })).payeeMcc).toBe(5812)
  })
})

describe('camada 1: natureza determinada pelo type do BCB', () => {
  it('APLICACAO_FINANCEIRA é transferência mesmo com category_ref de despesa', () => {
    const result = normalizeAccountTransaction(
      accountTx({ type: 'APLICACAO_FINANCEIRA', category_ref: 'OTHER' }),
    )
    expect(result.type).toBe('transfer')
  })

  it('RESGATE_APLIC_FINANCEIRA é transferência, não receita', () => {
    const result = normalizeAccountTransaction(
      accountTx({
        type: 'RESGATE_APLIC_FINANCEIRA',
        credit_debit_type: 'CREDITO',
        category_ref: 'OTHER',
      }),
    )
    expect(result.type).toBe('transfer')
    // O sinal do valor não muda: resgate entra dinheiro, valor positivo.
    expect(result.amountCents).toBeGreaterThan(0)
  })

  it('TRANSFERENCIA_SALDO_RESERVADO é transferência', () => {
    const result = normalizeAccountTransaction(
      accountTx({ type: 'TRANSFERENCIA_SALDO_RESERVADO', category_ref: 'OTHER' }),
    )
    expect(result.type).toBe('transfer')
  })

  it('RENDIMENTO_APLIC_FINANCEIRA é receita: rendimento é dinheiro novo', () => {
    const result = normalizeAccountTransaction(
      accountTx({
        type: 'RENDIMENTO_APLIC_FINANCEIRA',
        credit_debit_type: 'CREDITO',
        category_ref: 'TRANSFER_IN_OTHER_TRANSFER_IN',
      }),
    )
    expect(result.type).toBe('income')
  })

  it('OUTROS não desempata: quem decide é o category_ref', () => {
    const transferencia = normalizeAccountTransaction(
      accountTx({ type: 'OUTROS', category_ref: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS' }),
    )
    expect(transferencia.type).toBe('transfer')

    const despesa = normalizeAccountTransaction(
      accountTx({ type: 'OUTROS', category_ref: 'OTHER' }),
    )
    expect(despesa.type).toBe('expense')
  })

  it('polpType carrega o type cru da conta', () => {
    expect(normalizeAccountTransaction(accountTx({ type: 'TARIFA_SERVICOS_AVULSOS' })).polpType).toBe(
      'TARIFA_SERVICOS_AVULSOS',
    )
  })

  it('polpType é null em transação de cartão: transaction_type é outro enum', () => {
    expect(normalizeCardTransaction(cardTx()).polpType).toBeNull()
  })
})
