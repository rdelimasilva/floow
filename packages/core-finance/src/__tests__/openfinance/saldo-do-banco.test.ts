import { describe, it, expect } from 'vitest'
import { extrairApuracaoDoSaldo, extrairSaldoDisponivelCents, temAplicacaoAutomatica } from '../../openfinance/saldo-do-banco'

/**
 * O saldo que o BANCO informa, extraido do detalhe do recurso.
 *
 * Existe porque o floow deriva o saldo somando lancamento e nunca o conferia
 * com a fonte. Quando a Polp reemitiu o mesmo pagamento com outro id, o valor
 * duplicado entrou no saldo e so apareceu quando o usuario abriu o extrato
 * tres dias depois. Um numero contra o outro pega isso no mesmo dia — e pega
 * tambem o defeito que ninguem previu, que e o ponto.
 *
 * Extrair e separado de conferir de proposito: a forma do payload e da Polp,
 * a regra de divergencia e nossa.
 */
describe('extrairSaldoDisponivelCents', () => {
  it('le o saldo da conta corrente', () => {
    const detalhe = {
      balance: {
        update_date_time: '2026-09-22T07:14:13Z',
        available_amount: { amount: '6151.18', currency: 'BRL' },
        blocked_amount: { amount: '0.00', currency: 'BRL' },
      },
    }

    expect(extrairSaldoDisponivelCents(detalhe)).toBe(615118)
  })

  it('aceita amount numerico, nao so string', () => {
    // A Polp mistura os dois no mesmo payload: `limits[].unbilled_amount` vem
    // number enquanto `available_amount` vem string.
    const detalhe = { balance: { available_amount: { amount: 11685.4, currency: 'BRL' } } }

    expect(extrairSaldoDisponivelCents(detalhe)).toBe(1168540)
  })

  it('arredonda centavo de fracao binaria em vez de truncar', () => {
    // 0.1 + 0.2 em float da 0.30000000000000004; truncar perderia o centavo.
    const detalhe = { balance: { available_amount: { amount: 1234.565, currency: 'BRL' } } }

    expect(extrairSaldoDisponivelCents(detalhe)).toBe(123457)
  })

  it('le saldo negativo (conta no cheque especial)', () => {
    const detalhe = { balance: { available_amount: { amount: '-1751.44', currency: 'BRL' } } }

    expect(extrairSaldoDisponivelCents(detalhe)).toBe(-175144)
  })

  // Itaú com poupança automática, 10/11/2026: débitos da manhã deixaram a conta
  // em −R$ 9.884,34 até o resgate. O saldo do usuário é o total, R$ 28.819,34.
  it('com aplicacao automatica, le o saldo que a inclui', () => {
    const detalhe = {
      balance: {
        available_amount: { amount: '-9884.34', currency: 'BRL' },
        automatically_invested_amount: { amount: '28819.34', currency: 'BRL' },
      },
    }

    expect(extrairSaldoDisponivelCents(detalhe)).toBe(2881934)
    expect(temAplicacaoAutomatica(detalhe)).toBe(true)
  })

  it('sem aplicacao automatica, o banco repete o disponivel nos dois campos', () => {
    const detalhe = {
      balance: {
        available_amount: { amount: '550.59', currency: 'BRL' },
        automatically_invested_amount: { amount: '550.59', currency: 'BRL' },
      },
    }

    expect(extrairSaldoDisponivelCents(detalhe)).toBe(55059)
    expect(temAplicacaoAutomatica(detalhe)).toBe(false)
  })

  it('devolve null no cartao de credito, que nao tem saldo', () => {
    // O detalhe de CREDIT_CARD_ACCOUNT traz `limits`, nunca `balance`. Saldo de
    // cartao e outra semantica (fatura x limite) e nao se compara com este.
    const detalhe = { limits: [{ used_amount: { amount: '12300.13' } }] }

    expect(extrairSaldoDisponivelCents(detalhe)).toBeNull()
  })

  it('devolve null quando o amount nao e numero', () => {
    const detalhe = { balance: { available_amount: { amount: 'indisponivel' } } }

    expect(extrairSaldoDisponivelCents(detalhe)).toBeNull()
  })

  it('devolve null quando o payload nao e objeto', () => {
    expect(extrairSaldoDisponivelCents(null)).toBeNull()
    expect(extrairSaldoDisponivelCents('6151.18')).toBeNull()
    expect(extrairSaldoDisponivelCents(undefined)).toBeNull()
  })
})

/**
 * Quando o BANCO apurou o saldo, nao quando nos o gravamos.
 *
 * Importa porque a conferencia compara dois instantes diferentes: um saldo
 * apurado as 07:14 confrontado com lancamentos que entraram as 23h acusaria
 * divergencia que e so defasagem. Guardar a apuracao deixa quem le decidir se
 * a comparacao ainda vale.
 */
describe('extrairApuracaoDoSaldo', () => {
  it('le o instante em que o banco apurou', () => {
    const detalhe = {
      balance: {
        update_date_time: '2026-09-22T07:14:13Z',
        available_amount: { amount: '6151.18', currency: 'BRL' },
      },
    }

    expect(extrairApuracaoDoSaldo(detalhe)).toEqual(new Date('2026-09-22T07:14:13Z'))
  })

  it('devolve null quando o payload nao traz a data', () => {
    const detalhe = { balance: { available_amount: { amount: '6151.18' } } }

    expect(extrairApuracaoDoSaldo(detalhe)).toBeNull()
  })

  it('devolve null quando a data e impossivel de ler', () => {
    const detalhe = { balance: { update_date_time: 'ontem', available_amount: { amount: '1.00' } } }

    expect(extrairApuracaoDoSaldo(detalhe)).toBeNull()
  })
})
