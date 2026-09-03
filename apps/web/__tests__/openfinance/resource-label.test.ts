import { describe, expect, it } from 'vitest'
import { deriveResourceIdentity } from '@/lib/openfinance/resource-label'

/**
 * A promessa que estes testes protegem: quem tem dois cartões no mesmo banco
 * nunca vê duas linhas idênticas. Escolher errado joga o extrato de um cartão
 * na conta do outro, e não há como o usuário perceber olhando a tela.
 */

const CARTAO = { resourceType: 'CREDIT_CARD_ACCOUNT', polpResourceId: '3f1a0c2e-8b44-4d1a-9c6a-2d7f1b8e4a11' }

describe('deriveResourceIdentity — elo 1: detalhe do recurso', () => {
  it('usa apelido e final quando o detalhe traz os dois', () => {
    const id = deriveResourceIdentity({
      ...CARTAO,
      detail: { identification: { nickname: 'Platinum', identification_number: '5432109876541234' } },
    })

    expect(id.label).toBe('Cartão · Platinum · final 1234')
    expect(id.digits).toBe('1234')
    expect(id.source).toBe('detail')
  })

  it('acha o campo na raiz ou aninhado, indiferentemente', () => {
    // A doc diz que identification passou a existir na raiz, com o bloco
    // aninhado mantido como legado. Aceitar os dois evita depender de qual
    // versão a instituição devolve.
    const raiz = deriveResourceIdentity({ ...CARTAO, detail: { masked_number: '**** 9999' } })
    const aninhado = deriveResourceIdentity({ ...CARTAO, detail: { card: { number: '9999' } } })

    expect(raiz.digits).toBe('9999')
    expect(aninhado.digits).toBe('9999')
  })

  it('nunca deixa o número completo passar para o rótulo', () => {
    // O rótulo vai para a tela e os dígitos vão para o banco. Nenhum dos dois
    // precisa do PAN, e guardá-lo seria criar um problema que não temos.
    const id = deriveResourceIdentity({
      ...CARTAO,
      detail: { identification_number: '4111111111111111' },
    })

    expect(id.digits).toBe('1111')
    expect(id.label).not.toContain('4111')
  })
})

describe('deriveResourceIdentity — elo 2: transação', () => {
  it('cai para o identification_number da transação', () => {
    // A doc confirma esse campo em cada transação de cartão, então ele existe
    // mesmo quando o detalhe não ajuda.
    const id = deriveResourceIdentity({
      ...CARTAO,
      detail: { status: 'AVAILABLE' },
      sampleTransaction: { identification_number: '7788' },
    })

    expect(id.label).toBe('Cartão · final 7788')
    expect(id.source).toBe('transaction')
  })
})

describe('deriveResourceIdentity — elo 3: sempre distingue', () => {
  it('usa o fim do resource_id quando nada mais existe', () => {
    const id = deriveResourceIdentity({ ...CARTAO, detail: null })

    expect(id.source).toBe('fallback')
    expect(id.label).toBe('Cartão ·4a11')
  })

  it('dá rótulos diferentes para dois cartões sem identificação nenhuma', () => {
    // É o caso que motivou tudo: dois cartões, mesma instituição, zero
    // metadados. Feio, mas escolhível.
    const a = deriveResourceIdentity({
      resourceType: 'CREDIT_CARD_ACCOUNT',
      polpResourceId: '3f1a0c2e-8b44-4d1a-9c6a-2d7f1b8e4a11',
    })
    const b = deriveResourceIdentity({
      resourceType: 'CREDIT_CARD_ACCOUNT',
      polpResourceId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    })

    expect(a.label).not.toBe(b.label)
  })

  it('não quebra com payload inesperado', () => {
    for (const detail of [undefined, null, 'texto', 42, [], { identification: [] }]) {
      const id = deriveResourceIdentity({ ...CARTAO, detail })
      expect(id.label.length).toBeGreaterThan(0)
    }
  })
})

describe('deriveResourceIdentity — aprendizado sem dado sensível', () => {
  it('guarda as chaves do payload, nunca os valores', () => {
    // É assim que a forma real da resposta vira conhecimento sem ninguém
    // precisar inspecionar a conta de um cliente.
    const id = deriveResourceIdentity({
      ...CARTAO,
      detail: { status: 'AVAILABLE', identification: { nickname: 'Platinum', number: '1234' } },
    })

    expect(id.detailKeys).toContain('status')
    expect(id.detailKeys).toContain('identification.nickname')
    expect(id.detailKeys).not.toContain('Platinum')
    expect(JSON.stringify(id.detailKeys)).not.toContain('1234')
  })

  it('rotula conta bancária como conta, não como cartão', () => {
    const id = deriveResourceIdentity({
      resourceType: 'ACCOUNT',
      polpResourceId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      detail: { identification: { account_number: '00012345' } },
    })

    expect(id.label).toBe('Conta · final 2345')
  })
})

describe('deriveResourceIdentity — payloads reais do Itaú', () => {
  it('nomeia o cartão com produto e final, como a instituição manda', () => {
    // Forma verificada na API em 2026-09-03. O final NÃO está na raiz nem em
    // `identification` direto: mora em payment_methods[0].identification_number.
    const id = deriveResourceIdentity({
      resourceType: 'CREDIT_CARD_ACCOUNT',
      polpResourceId: '01a067d2-0000-0000-0000-000000008473',
      detail: {
        name: 'PERSONNALITE MC BLACK',
        credit_card_network: 'MASTERCARD',
        product_type: 'BLACK',
        payment_methods: [{ identification_number: '9629', is_multiple_credit_card: false }],
        identification: {
          name: 'PERSONNALITE MC BLACK',
          payment_methods: [{ identification_number: '9629' }],
        },
      },
    })

    expect(id.label).toBe('Cartão · PERSONNALITE MC BLACK · final 9629')
    expect(id.digits).toBe('9629')
    expect(id.source).toBe('detail')
  })

  it('nomeia a conta com agência e final', () => {
    const id = deriveResourceIdentity({
      resourceType: 'ACCOUNT',
      polpResourceId: '01a067d2-0000-0000-0000-000000005177',
      detail: {
        number: '12344506',
        branch_code: '7069',
        check_digit: '5',
        type: 'CONTA_DEPOSITO_A_VISTA',
        subtype: 'CONJUNTA_SIMPLES',
        identification: { number: '12344506', branch_code: '7069' },
      },
    })

    expect(id.label).toBe('Conta · ag 7069 · final 4506')
    expect(id.digits).toBe('4506')
  })

  it('distingue dois cartões da mesma instituição', () => {
    // O caso que originou tudo: dois cartões no mesmo banco.
    const black = deriveResourceIdentity({
      resourceType: 'CREDIT_CARD_ACCOUNT',
      polpResourceId: '01a067d2-0000-0000-0000-000000008473',
      detail: { name: 'PERSONNALITE MC BLACK', payment_methods: [{ identification_number: '9629' }] },
    })
    const platinum = deriveResourceIdentity({
      resourceType: 'CREDIT_CARD_ACCOUNT',
      polpResourceId: '01a067d2-0000-0000-0000-000000009999',
      detail: { name: 'ITAUCARD VISA PLATINUM', payment_methods: [{ identification_number: '4417' }] },
    })

    expect(black.label).not.toBe(platinum.label)
    expect(black.label).toContain('9629')
    expect(platinum.label).toContain('4417')
  })
})
