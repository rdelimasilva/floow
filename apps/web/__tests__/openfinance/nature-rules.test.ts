import { describe, expect, it } from 'vitest'
import {
  applyNatureRules,
  foldForMatch,
  natureForDescription,
  type NatureRule,
} from '@/lib/openfinance/nature-rules'
import type { NormalizedPolpTransaction } from '@floow/core-finance'

/**
 * A regra de natureza é a única coisa no floow que pode transformar despesa em
 * transferência. Errar a precedência aqui apaga ou dobra um mês de gasto no
 * orçamento sem nada acusar.
 */

const CONTA = 'conta-corrente'
const OUTRA_CONTA = 'conta-poupanca'

function rule(overrides: Partial<NatureRule> = {}): NatureRule {
  return {
    id: 'r1',
    accountId: null,
    matchType: 'contains',
    matchValue: 'PERS BLACK',
    nature: 'transfer',
    priority: 0,
    isEnabled: true,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  }
}

function tx(overrides: Partial<NormalizedPolpTransaction> = {}): NormalizedPolpTransaction {
  return {
    externalId: 'tx-1',
    date: '2026-08-12',
    amountCents: -1180422,
    type: 'expense',
    description: 'Débito automático PERS BLACK 12/08',
    categoryRef: 'BANK_FEES_OTHER_BANK_FEES',
    polpType: 'TARIFA_SERVICOS_AVULSOS',
    payeeMcc: null,
    billPostDate: null,
    billForecastMonth: null,
    installmentNumber: null,
    installmentTotal: null,
    settlement: 'settled',
    foreign: null,
    ...overrides,
  }
}

describe('foldForMatch', () => {
  it('ignora acento, caixa e espaço sobrando', () => {
    expect(foldForMatch('  Aplicação   CDB  ')).toBe('APLICACAO CDB')
  })
})

describe('natureForDescription', () => {
  it('contains casa no meio da descrição', () => {
    expect(natureForDescription('Débito automático PERS BLACK 12/08', CONTA, [rule()])).toBe(
      'transfer',
    )
  })

  it('exact exige a descrição inteira', () => {
    const regras = [rule({ matchType: 'exact', matchValue: 'Aplicação CDB DI' })]
    expect(natureForDescription('Aplicação CDB DI', CONTA, regras)).toBe('transfer')
    expect(natureForDescription('Aplicação CDB DI 12/08', CONTA, regras)).toBeUndefined()
  })

  it('regra de conta específica ganha da regra da org', () => {
    const regras = [
      rule({ id: 'org', accountId: null, nature: 'expense', priority: 99 }),
      rule({ id: 'conta', accountId: CONTA, nature: 'transfer', priority: 0 }),
    ]
    expect(natureForDescription('PERS BLACK', CONTA, regras)).toBe('transfer')
  })

  it('regra de outra conta não vale nesta', () => {
    const regras = [rule({ accountId: OUTRA_CONTA })]
    expect(natureForDescription('PERS BLACK', CONTA, regras)).toBeUndefined()
  })

  it('empate de escopo é resolvido por priority, depois por created_at', () => {
    const porPrioridade = [
      rule({ id: 'baixa', nature: 'expense', priority: 1 }),
      rule({ id: 'alta', nature: 'transfer', priority: 5 }),
    ]
    expect(natureForDescription('PERS BLACK', CONTA, porPrioridade)).toBe('transfer')

    const porData = [
      rule({ id: 'antiga', nature: 'expense', createdAt: new Date('2026-01-01T00:00:00Z') }),
      rule({ id: 'nova', nature: 'transfer', createdAt: new Date('2026-09-01T00:00:00Z') }),
    ]
    expect(natureForDescription('PERS BLACK', CONTA, porData)).toBe('transfer')
  })

  it('regra desligada é ignorada — a função filtra, não confia em quem chama', () => {
    expect(natureForDescription('PERS BLACK', CONTA, [rule({ isEnabled: false })])).toBeUndefined()
  })

  it('match_value só com espaço é ignorado, não casa com tudo', () => {
    expect(natureForDescription('qualquer coisa', CONTA, [rule({ matchValue: '   ' })])).toBeUndefined()
  })
})

describe('applyNatureRules', () => {
  it('troca a natureza e não toca em valor nem data', () => {
    const [resultado] = applyNatureRules([tx()], CONTA, [rule()])
    expect(resultado.type).toBe('transfer')
    expect(resultado.amountCents).toBe(-1180422)
    expect(resultado.date).toBe('2026-08-12')
  })

  it('sem regra que case, devolve a natureza que veio da camada 1 intacta', () => {
    const entrada = [tx({ type: 'transfer', description: 'Aplicação CDB DI' })]
    expect(applyNatureRules(entrada, CONTA, [rule()])[0].type).toBe('transfer')
  })

  it('lista de regras vazia devolve o mesmo array, sem cópia', () => {
    const entrada = [tx()]
    expect(applyNatureRules(entrada, CONTA, [])).toBe(entrada)
  })

  it('uma regra de despesa reafirma despesa: é o caminho que silencia o alerta', () => {
    const regras = [rule({ nature: 'expense' })]
    expect(applyNatureRules([tx()], CONTA, regras)[0].type).toBe('expense')
  })
})
