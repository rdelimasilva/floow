import { describe, expect, it } from 'vitest'
import { counterpartyKeyFor, compositeKey, foldForMatch } from '@/lib/openfinance/counterparty-key'

const CONTA = 'conta-1'

function tx(overrides: { counterpartyTaxId?: string | null; description?: string; amountCents?: number } = {}) {
  return {
    counterpartyTaxId: overrides.counterpartyTaxId ?? null,
    description: overrides.description ?? 'Débito automático PERS BLACK 12/08',
    amountCents: overrides.amountCents ?? -50000,
  }
}

describe('foldForMatch', () => {
  it('ignora acento, caixa e espaço sobrando', () => {
    expect(foldForMatch('  Débito   Automático  ')).toBe('DEBITO AUTOMATICO')
  })
})

describe('counterpartyKeyFor', () => {
  it('usa tax_id quando presente, accountId nulo', () => {
    const key = counterpartyKeyFor(tx({ counterpartyTaxId: '12345678000190' }), CONTA)
    expect(key).toEqual({ keyType: 'tax_id', keyValue: '12345678000190', direction: 'out', accountId: null })
  })

  it('cai para descrição normalizada e escopada à conta quando não há tax_id', () => {
    const key = counterpartyKeyFor(tx({ description: 'Débito automático PERS BLACK 12/08 1234' }), CONTA)
    expect(key).toEqual({
      keyType: 'description',
      keyValue: 'DEBITO AUTOMATICO PERS BLACK',
      direction: 'out',
      accountId: CONTA,
    })
  })

  it('a mesma operação repetida todo mês cai na mesma chave — dígitos somem', () => {
    const a = counterpartyKeyFor(tx({ description: 'Débito automático PERS BLACK 10/08' }), CONTA)
    const b = counterpartyKeyFor(tx({ description: 'Débito automático PERS BLACK 11/09' }), CONTA)
    expect(a).toEqual(b)
  })

  it('direção vem do sinal do valor: entrada é "in", saída é "out"', () => {
    const entrada = counterpartyKeyFor(tx({ amountCents: 30000 }), CONTA)
    const saida = counterpartyKeyFor(tx({ amountCents: -30000 }), CONTA)
    expect(entrada!.direction).toBe('in')
    expect(saida!.direction).toBe('out')
  })

  it('a mesma contraparte cobrando e devolvendo são chaves diferentes', () => {
    // O falso positivo mais caro do detector antigo: Unimed cobrando a
    // mensalidade e devolvendo reembolso são a mesma entidade, mas o sinal
    // errado se essas duas viram a MESMA chave.
    const cobranca = counterpartyKeyFor(tx({ counterpartyTaxId: '1', amountCents: -32562 }), CONTA)
    const reembolso = counterpartyKeyFor(tx({ counterpartyTaxId: '1', amountCents: 5522 }), CONTA)
    expect(compositeKey(cobranca!)).not.toBe(compositeKey(reembolso!))
  })

  it('descrição que normaliza para vazio não produz chave', () => {
    expect(counterpartyKeyFor(tx({ description: '12/08 1234' }), CONTA)).toBeNull()
  })
})

describe('compositeKey', () => {
  it('duas chaves tax_id iguais produzem a mesma string', () => {
    const a = counterpartyKeyFor(tx({ counterpartyTaxId: '999' }), 'conta-a')
    const b = counterpartyKeyFor(tx({ counterpartyTaxId: '999' }), 'conta-b')
    // accountId é ignorado na chave de tax_id — mesma entidade em qualquer conta.
    expect(compositeKey(a!)).toBe(compositeKey(b!))
  })
})
