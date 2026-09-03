import { describe, expect, it } from 'vitest'
import {
  detectNatureSuspects,
  explainSuspect,
  groupKey,
  type ConnectedCard,
  type KnownTransfer,
  type SuspectCandidate,
} from '@/lib/openfinance/nature-suspects'

/**
 * O detector sugere e nunca aplica. O teste que importa mais aqui é o
 * NEGATIVO: um detector que marca "Aluguel" como suspeito ensina o usuário a
 * ignorar o alerta, e a partir daí o subsistema inteiro deixa de servir.
 */

const CONTA = 'conta-corrente'

function candidate(overrides: Partial<SuspectCandidate> = {}): SuspectCandidate {
  return {
    id: 'tx-1',
    accountId: CONTA,
    accountName: 'Conta Corrente Itaú',
    description: 'Débito automático PERS BLACK 12/08',
    amountCents: -1180422,
    categoryRef: 'BANK_FEES_OTHER_BANK_FEES',
    polpType: 'TARIFA_SERVICOS_AVULSOS',
    ...overrides,
  }
}

/** Nove meses do mesmo débito, com data diferente na descrição. */
function faturaDoCartao(): SuspectCandidate[] {
  return Array.from({ length: 9 }, (_, i) =>
    candidate({
      id: `fatura-${i}`,
      description: `Débito automático PERS BLACK ${10 + i}/08 1234`,
      amountCents: -1180422,
    }),
  )
}

function aplicacaoCdb(): SuspectCandidate[] {
  return Array.from({ length: 14 }, (_, i) =>
    candidate({
      id: `cdb-${i}`,
      description: 'Aplicação CDB DI',
      amountCents: -895714,
      categoryRef: 'OTHER',
      polpType: 'OUTROS',
    }),
  )
}

const CARTAO: ConnectedCard = { label: 'Cartão · PERSONNALITE MC BLACK · final 1234', digits: '1234' }

const TRANSFERENCIA_CONHECIDA: KnownTransfer[] = [
  { accountId: CONTA, description: 'Saída APLICACAO CDB DI' },
]

describe('groupKey', () => {
  it('remove data e número para o mesmo débito mensal cair num grupo', () => {
    expect(groupKey('Débito automático PERS BLACK 12/08 1234')).toBe('DEBITO AUTOMATICO PERS BLACK')
    expect(groupKey('Débito automático PERS BLACK 11/07 1234')).toBe('DEBITO AUTOMATICO PERS BLACK')
  })
})

describe('detectNatureSuspects', () => {
  it('acha o pagamento de fatura pelo nome do cartão conectado', () => {
    const [grupo] = detectNatureSuspects({
      candidates: faturaDoCartao(),
      cards: [CARTAO],
      knownTransfers: [],
    })

    expect(grupo.count).toBe(9)
    expect(grupo.totalCents).toBe(-1180422 * 9)
    expect(grupo.transactionIds).toHaveLength(9)
    expect(grupo.signals).toContainEqual({ kind: 'connected-card', cardLabel: CARTAO.label })
  })

  it('acha a aplicação de CDB por vocabulário e pela contradição da própria Polp', () => {
    const [grupo] = detectNatureSuspects({
      candidates: aplicacaoCdb(),
      cards: [],
      knownTransfers: TRANSFERENCIA_CONHECIDA,
    })

    expect(grupo.signals.map((s) => s.kind).sort()).toEqual([
      'investment-vocabulary',
      'polp-contradiction',
    ])
  })

  it('ordena por dinheiro: o maior grupo vem primeiro', () => {
    const grupos = detectNatureSuspects({
      candidates: [...faturaDoCartao(), ...aplicacaoCdb()],
      cards: [CARTAO],
      knownTransfers: TRANSFERENCIA_CONHECIDA,
    })

    expect(grupos).toHaveLength(2)
    expect(Math.abs(grupos[0].totalCents)).toBeGreaterThan(Math.abs(grupos[1].totalCents))
  })

  it('NÃO sugere despesa legítima recorrente de valor alto', () => {
    const aluguel = Array.from({ length: 12 }, (_, i) =>
      candidate({
        id: `aluguel-${i}`,
        description: 'Aluguel',
        amountCents: -400000,
        categoryRef: 'RENT_AND_UTILITIES_RENT',
        polpType: 'BOLETO',
      }),
    )
    const escola = Array.from({ length: 12 }, (_, i) =>
      candidate({
        id: `escola-${i}`,
        description: 'Mensalidade escola',
        amountCents: -260000,
        categoryRef: 'OTHER',
        polpType: 'OUTROS',
      }),
    )

    expect(
      detectNatureSuspects({ candidates: [...aluguel, ...escola], cards: [CARTAO], knownTransfers: [] }),
    ).toEqual([])
  })

  it('um token só não casa com o cartão: BLACK FRIDAY não é fatura', () => {
    const compras = Array.from({ length: 4 }, (_, i) =>
      candidate({
        id: `bf-${i}`,
        description: 'Compra BLACK FRIDAY',
        amountCents: -50000,
        categoryRef: 'OTHER',
        polpType: 'OUTROS',
      }),
    )

    expect(detectNatureSuspects({ candidates: compras, cards: [CARTAO], knownTransfers: [] })).toEqual([])
  })

  it('sinal estrutural sozinho não produz sugestão', () => {
    const genericos = Array.from({ length: 5 }, (_, i) =>
      candidate({
        id: `g-${i}`,
        description: 'Pagamento fornecedor Zeta',
        amountCents: -300000,
        categoryRef: 'OTHER',
        polpType: 'OUTROS',
      }),
    )

    expect(detectNatureSuspects({ candidates: genericos, cards: [], knownTransfers: [] })).toEqual([])
  })

  it('grupo pequeno e barato fica abaixo do corte', () => {
    const pequeno = [
      candidate({ id: 'p1', description: 'Aplicação CDB DI', amountCents: -2000, categoryRef: 'OTHER' }),
      candidate({ id: 'p2', description: 'Aplicação CDB DI', amountCents: -2000, categoryRef: 'OTHER' }),
    ]

    expect(detectNatureSuspects({ candidates: pequeno, cards: [], knownTransfers: [] })).toEqual([])
  })

  it('grupo de dois lançamentos passa quando o valor é alto', () => {
    const caro = [
      candidate({ id: 'c1', description: 'Aplicação CDB DI', amountCents: -5000000, categoryRef: 'OTHER' }),
      candidate({ id: 'c2', description: 'Aplicação CDB DI', amountCents: -5000000, categoryRef: 'OTHER' }),
    ]

    expect(detectNatureSuspects({ candidates: caro, cards: [], knownTransfers: [] })).toHaveLength(1)
  })

  it('a mesma descrição em contas diferentes vira grupos diferentes', () => {
    const grupos = detectNatureSuspects({
      candidates: [
        ...aplicacaoCdb(),
        ...aplicacaoCdb().map((c) => ({ ...c, id: `outra-${c.id}`, accountId: 'poupanca', accountName: 'Poupança' })),
      ],
      cards: [],
      knownTransfers: [],
    })

    expect(grupos).toHaveLength(2)
    expect(new Set(grupos.map((g) => g.accountId))).toEqual(new Set([CONTA, 'poupanca']))
  })

  it('a contradição só vale na mesma conta', () => {
    const [grupo] = detectNatureSuspects({
      candidates: aplicacaoCdb(),
      cards: [],
      knownTransfers: [{ accountId: 'outra-conta', description: 'Saída APLICACAO CDB DI' }],
    })

    expect(grupo.signals.map((s) => s.kind)).toEqual(['investment-vocabulary'])
  })
})

describe('explainSuspect', () => {
  it('explica o cartão pelo nome', () => {
    const [grupo] = detectNatureSuspects({
      candidates: faturaDoCartao(),
      cards: [CARTAO],
      knownTransfers: [],
    })

    expect(explainSuspect(grupo)).toContain('PERSONNALITE MC BLACK')
  })

  it('menciona o rótulo genérico do banco quando há sinal estrutural', () => {
    const [grupo] = detectNatureSuspects({
      candidates: aplicacaoCdb(),
      cards: [],
      knownTransfers: TRANSFERENCIA_CONHECIDA,
    })

    expect(grupo.structuralHint).toBe(true)
    expect(explainSuspect(grupo)).toContain('genérico')
  })
})
