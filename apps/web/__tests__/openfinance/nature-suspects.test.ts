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
  { accountId: CONTA, description: 'Saída APLICACAO CDB DI', amountCents: -100000 },
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

  it('token repetido na transferência não vale por dois', () => {
    // M1 da revisão final. `shared.length >= 2` contava a REPETIÇÃO: "CDB CDB"
    // satisfazia a exigência de dois tokens distintos com um token só, e
    // enfraquecia justamente o sinal mais forte do detector — o único que é
    // evidência do próprio dado do usuário. Só "CDB" está em comum aqui.
    const [grupo] = detectNatureSuspects({
      candidates: aplicacaoCdb().map((c) => ({ ...c, description: 'Aplicação CDB' })),
      cards: [],
      knownTransfers: [{ accountId: CONTA, description: 'Saída CDB CDB', amountCents: -100000 }],
    })

    expect(grupo.signals.map((s) => s.kind)).toEqual(['investment-vocabulary'])
  })

  it('dois tokens distintos em comum continuam sendo contradição', () => {
    const [grupo] = detectNatureSuspects({
      candidates: aplicacaoCdb().map((c) => ({ ...c, description: 'Aplicação CDB' })),
      cards: [],
      knownTransfers: [{ accountId: CONTA, description: 'Saída APLICACAO CDB', amountCents: -100000 }],
    })

    expect(grupo.signals.map((s) => s.kind).sort()).toEqual([
      'investment-vocabulary',
      'polp-contradiction',
    ])
  })

  /**
   * O prefixo burocrático do banco não é a operação.
   *
   * Descrição de extrato brasileiro começa com duas ou três palavras de
   * envelope — "Pagamento de Pix QR Code", "Débito automático", "Pagamento de
   * boleto". O limiar de dois tokens distintos era satisfeito pelo envelope
   * sozinho, e o sinal mais forte do detector passou a casar qualquer despesa
   * com qualquer transferência da conta. Medido contra o extrato real de uma
   * org: 30 grupos e R$ 537 mil sinalizados, 81% de TUDO que a pessoa gastou.
   */
  describe('o prefixo do banco sozinho não é contradição', () => {
    const casos: Array<[string, string]> = [
      ['Pagamento de boleto HANNI DAVID IMOVEIS LTDA', 'Pagamento de Pix QR Code M4 PRODUTOS E SERVICOS LTDA'],
      ['Pagamento de Pix QR Code Clientbase Ltda', 'Pagamento de Pix QR Code Ricardo de Lima Silva'],
      ['Débito automático PERS BLACK', 'Débito automático ITAU VISA PAO DE AC'],
      ['Pagamento de boleto INT PERS BLACK', 'Pagamento de boleto BRADESCO VIDA E PREVIDENCIA'],
      // Os três abaixo sobreviviam a exigir PROPORÇÃO dos tokens em comum: o
      // envelope ocupa quatro dos cinco tokens da chave, então qualquer outro
      // Pix da conta cobre 80% dela sem ter nada a ver com a operação.
      ['Pagamento de Pix QR Code Clientbase Ltda', 'Pagamento de Pix QR Code M4 PRODUTOS E SERVICOS LTDA'],
      ['Pagamento de Pix QR Code PIX MARKETPLACE', 'Pagamento de Pix QR Code Ricardo de Lima Silva'],
      ['Pagamento de Pix QR Code PIX QRS CLIENTBASE', 'Pagamento de Pix QR Code PIX QRS VINDI PAGAM 27/02'],
    ]

    for (const [despesa, transferencia] of casos) {
      it(`"${despesa}" não contradiz "${transferencia}"`, () => {
        const [grupo] = detectNatureSuspects({
          candidates: Array.from({ length: 5 }, (_, i) =>
            candidate({ id: `t-${i}`, description: despesa, amountCents: -50000 }),
          ),
          cards: [],
          knownTransfers: [{ accountId: CONTA, description: transferencia, amountCents: -100000 }],
        })

        expect(grupo).toBeUndefined()
      })
    }
  })

  it('a mesma descrição dos dois lados continua sendo contradição', () => {
    // O caso que o sinal existe para pegar: o banco mandou a MESMA operação
    // como despesa e como transferência. Aqui não há envelope nenhum sobrando.
    const [grupo] = detectNatureSuspects({
      candidates: Array.from({ length: 5 }, (_, i) =>
        candidate({ id: `unimed-${i}`, description: 'Unimed Cnu', amountCents: -325626 }),
      ),
      cards: [],
      knownTransfers: [{ accountId: CONTA, description: 'Unimed Cnu', amountCents: -100000 }],
    })

    expect(grupo.signals.map((s) => s.kind)).toEqual(['polp-contradiction'])
  })

  it('descrição idêntica vale mesmo quando sobra um token de identidade só', () => {
    // "Stark Bank S.A." tem BANK na lista de envelope e STARK sozinho não
    // chegaria a dois tokens. O caminho da descrição idêntica existe para que
    // o custo da lista não derrube o caso mais forte do sinal.
    const [grupo] = detectNatureSuspects({
      candidates: Array.from({ length: 5 }, (_, i) =>
        candidate({ id: `stark-${i}`, description: 'Stark Bank S.A.', amountCents: -379331 }),
      ),
      cards: [],
      knownTransfers: [{ accountId: CONTA, description: 'Stark Bank S.A.', amountCents: -100000 }],
    })

    expect(grupo.signals.map((s) => s.kind)).toEqual(['polp-contradiction'])
  })

  it('nome de cidade em comum não é contradição', () => {
    // A stoplist de palavras burocráticas cobria o envelope e não cobria "SAO
    // PAULO": dois tokens perfeitamente comuns, e "Estado de São Paulo" casava
    // com um estacionamento rotativo. Não há lista que termine.
    const [grupo] = detectNatureSuspects({
      candidates: Array.from({ length: 5 }, (_, i) =>
        candidate({ id: `sp-${i}`, description: 'Enel Distribuicao Sao Paulo', amountCents: -50000 }),
      ),
      cards: [],
      knownTransfers: [
        { accountId: CONTA, description: 'Pagamento de Pix QR Code Z.A. DIGITAL DE SAO PAULO ESTACIONAMENTO ROTATIVO S.A.', amountCents: -100000 },
      ],
    })

    expect(grupo).toBeUndefined()
  })

  it('chave de um token só exige descrição idêntica', () => {
    const candidatos = Array.from({ length: 5 }, (_, i) =>
      candidate({ id: `onr-${i}`, description: 'Onr', amountCents: -50000 }),
    )

    const [identica] = detectNatureSuspects({
      candidates: candidatos,
      cards: [],
      knownTransfers: [{ accountId: CONTA, description: 'Onr', amountCents: -100000 }],
    })
    expect(identica.signals.map((s) => s.kind)).toEqual(['polp-contradiction'])

    // Continência com um token só viraria "qualquer transferência que mencione
    // a palavra", que é a armadilha do "Aluguel".
    const [apenasContida] = detectNatureSuspects({
      candidates: candidatos,
      cards: [],
      knownTransfers: [{ accountId: CONTA, description: 'Pagamento de boleto ONR cartorio', amountCents: -100000 }],
    })
    expect(apenasContida).toBeUndefined()
  })

  it('reembolso NAO contradiz a despesa que ele devolve', () => {
    // A mensalidade do plano de saude vinha marcada por causa dos reembolsos
    // que a Unimed devolve: a Polp manda o texto identico ("Unimed Cnu") nos
    // dois sentidos, e o reembolso entrou como transferencia. Medido no
    // extrato real: R$ 35.818,91 de mensalidade legitima sinalizados por oito
    // creditos de R$ 243 a R$ 690, e R$ 7.624,85 de "Altavis Aldeia"
    // sinalizados por um unico credito de R$ 22,72.
    //
    // Uma despesa "ser na verdade transferencia" significa dinheiro SAINDO
    // para outro bolso do usuario. Uma entrada com o mesmo nome e o reembolso
    // daquela despesa — evidencia de que ela e real, e nao de que e falsa. O
    // sinal lia a evidencia ao contrario.
    const mensalidades = Array.from({ length: 11 }, (_, i) =>
      candidate({ id: `unimed-${i}`, description: 'Unimed Cnu', amountCents: -325626 }),
    )

    expect(
      detectNatureSuspects({
        candidates: mensalidades,
        cards: [],
        knownTransfers: [{ accountId: CONTA, description: 'Unimed Cnu', amountCents: 55220 }],
      }),
    ).toEqual([])

    // A mesma descricao SAINDO continua sendo contradicao.
    const [saida] = detectNatureSuspects({
      candidates: mensalidades,
      cards: [],
      knownTransfers: [{ accountId: CONTA, description: 'Unimed Cnu', amountCents: -325626 }],
    })
    expect(saida.signals.map((s) => s.kind)).toEqual(['polp-contradiction'])
  })

  it('a contradição só vale na mesma conta', () => {
    const [grupo] = detectNatureSuspects({
      candidates: aplicacaoCdb(),
      cards: [],
      knownTransfers: [{ accountId: 'outra-conta', description: 'Saída APLICACAO CDB DI', amountCents: -100000 }],
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
