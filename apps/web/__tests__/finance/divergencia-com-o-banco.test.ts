import { describe, it, expect } from 'vitest'
import { compararComOBanco } from '@/lib/finance/divergencia-com-o-banco'

/**
 * A conferencia entre o saldo que derivamos e o que o banco informa.
 *
 * Separada da leitura do payload e da tela: a forma do dado e da Polp, a
 * decisao de quando alarmar e nossa, e quem desenha o aviso nao precisa saber
 * nenhuma das duas.
 */
describe('compararComOBanco', () => {
  it('acusa a divergencia com o sinal de quem sobra', () => {
    // O caso real: R$ 11.685,40 de fatura duplicada deixaram o nosso saldo
    // MAIS NEGATIVO que o do banco. Diferenca negativa = falta dinheiro aqui.
    const r = compararComOBanco({ saldoLocalCents: -1751441, saldoBancoCents: 615118 })

    expect(r.divergente).toBe(true)
    expect(r.diferencaCents).toBe(-2366559)
  })

  it('não acusa nada quando os dois batem no centavo', () => {
    const r = compararComOBanco({ saldoLocalCents: 615118, saldoBancoCents: 615118 })

    expect(r.divergente).toBe(false)
    expect(r.diferencaCents).toBe(0)
  })

  it('acusa diferença de um único centavo', () => {
    // Sem tolerancia de propósito: um centavo de diferenca e um lancamento
    // errado em algum lugar, e a unica forma de descobrir qual e olhando.
    const r = compararComOBanco({ saldoLocalCents: 615119, saldoBancoCents: 615118 })

    expect(r.divergente).toBe(true)
    expect(r.diferencaCents).toBe(1)
  })

  it('não compara quando o banco não informou saldo', () => {
    // Cartao de credito e conta sem Open Finance caem aqui. Ausencia de dado
    // nao e conferencia bem-sucedida.
    const r = compararComOBanco({ saldoLocalCents: 615118, saldoBancoCents: null })

    expect(r.divergente).toBe(false)
    expect(r.comparavel).toBe(false)
  })

  it('marca como comparável quando houve conferência de verdade', () => {
    const r = compararComOBanco({ saldoLocalCents: 615118, saldoBancoCents: 615118 })

    expect(r.comparavel).toBe(true)
  })

  it('tira da conta o que chegou depois da apuração do banco', () => {
    // O caso real: o salário de R$ 32.048,28 entrou às 11:38 e o saldo do
    // banco era das 06:59. Comparar os dois acusava R$ 33.557,58; a
    // diferença de verdade era R$ 1.509,30.
    const r = compararComOBanco({ saldoLocalCents: 3208220, saldoBancoCents: -147538, chegouDepoisCents: 3204828 })

    expect(r.diferencaCents).toBe(150930)
  })

  it('bate quando a única diferença é o que chegou depois', () => {
    const r = compararComOBanco({ saldoLocalCents: 3204828 + 3392, saldoBancoCents: 3392, chegouDepoisCents: 3204828 })

    expect(r.divergente).toBe(false)
  })

  it('uma leitura só não avisa: é o débito que o extrato traz amanhã', () => {
    // 18/10/2026: débito automático de R$ 316,74 no saldo do Itaú, fora do extrato.
    const r = compararComOBanco({ saldoLocalCents: 1669490, saldoBancoCents: 1637816, leiturasDivergentes: 1 })

    expect(r.diferencaCents).toBe(31674)
    expect(r.divergente).toBe(false)
  })

  it('a diferença que sobrevive à segunda leitura avisa', () => {
    const r = compararComOBanco({ saldoLocalCents: 1669490, saldoBancoCents: 1637816, leiturasDivergentes: 2 })

    expect(r.divergente).toBe(true)
  })
})
