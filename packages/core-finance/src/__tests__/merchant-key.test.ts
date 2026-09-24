import { describe, it, expect } from 'vitest'
import { normalizeMerchant, ruleTermFor, normalizeCategoryName } from '../category-suggestions/merchant-key'

describe('normalizeMerchant', () => {
  it('fica com o primeiro token quando ele tem 5+ letras', () => {
    expect(normalizeMerchant('IFOOD *RESTAURANTE XYZ')).toBe('ifood')
    expect(normalizeMerchant('Ifood Mercado 123')).toBe('ifood')
  })
  it('fica com dois tokens quando o primeiro é curto', () => {
    expect(normalizeMerchant('UBER *TRIP SAO PAULO BR')).toBe('uber trip')
  })
  it('descarta prefixo de adquirente, dígitos e acento', () => {
    expect(normalizeMerchant('PAG*Padaria São João 0001')).toBe('padaria')
    expect(normalizeMerchant('MP *NETFLIX 12/03')).toBe('netflix')
  })
  it('descrição só com palavras genéricas vira vazio', () => {
    expect(normalizeMerchant('PIX ENVIADO 123456')).toBe('')
    expect(normalizeMerchant('Pagamento de boleto')).toBe('')
    expect(normalizeMerchant('')).toBe('')
  })
  it('pix para pessoa vira o nome da pessoa', () => {
    expect(normalizeMerchant('PIX ENVIADO JOAO SILVA')).toBe('joao silva')
  })
})

describe('ruleTermFor', () => {
  it('usa a chave quando ela é substring de todas as descrições', () => {
    expect(ruleTermFor('ifood', ['IFOOD *REST A', 'Ifood Mercado'])).toBe('ifood')
  })
  it('cai para o primeiro token quando a chave não é substring', () => {
    expect(ruleTermFor('uber trip', ['UBER *TRIP SP', 'UBER *TRIP RJ'])).toBe('uber')
  })
  it('devolve null quando nada casa com todas', () => {
    expect(ruleTermFor('padaria', ['PAG*Padaria', 'Padaría Central'])).toBeNull()
  })
  it('recusa termo com menos de 3 letras', () => {
    expect(ruleTermFor('ab cd', ['AB*CD loja'])).toBeNull()
  })
})

describe('normalizeCategoryName', () => {
  it('ignora caixa, acento e espaços', () => {
    expect(normalizeCategoryName('  Saúde ')).toBe(normalizeCategoryName('saude'))
  })
})
