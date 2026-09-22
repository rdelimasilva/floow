import { describe, it, expect } from 'vitest'
import { detectarDuplicatas, type LancamentoParaDedupe } from '../../openfinance/duplicata'

/**
 * A Polp entrega o MESMO evento duas vezes, com `external_id` diferentes.
 *
 * O dedupe da ingestao e o indice unico `(external_id, account_id)`, que nao
 * protege contra isso: em 16/09 o pagamento da fatura entrou como "SAIDA
 * FATURA PERSON MC BLACK" e de novo como "Debito automatico FATURA PERSON MC
 * BLACK", R$ 11.685,40 duas vezes no saldo.
 *
 * O que NAO serve para detectar:
 *  - descricao, que difere nas duplicatas verdadeiras e e identica em compras
 *    repetidas legitimas ("Westwing" cinco vezes no mesmo dia);
 *  - `created_at`, porque as duas linhas entraram no mesmo sync, no mesmo
 *    milissegundo.
 *
 * O que serve e o instante em que a POLP emitiu cada id. O `external_id` e
 * UUIDv7, que carrega o timestamp: nos tres pares reais as emissoes estao a
 * 3h, 16h e 31h de distancia — a fonte reemitiu o evento ao enriquece-lo —
 * enquanto toda compra repetida legitima chega no mesmo lote, a milissegundos.
 */

/** UUIDv7 com o timestamp pedido, para o teste falar em horas e nao em hex. */
function uuidV7Em(iso: string, sufixo = '0000'): string {
  const ms = new Date(iso).getTime().toString(16).padStart(12, '0')
  return `${ms.slice(0, 8)}-${ms.slice(8, 12)}-7${sufixo.slice(0, 3)}-8000-000000000000`
}

const BASE: LancamentoParaDedupe = {
  id: 'tx-1',
  dateISO: '2026-09-16',
  amountCents: -1168540,
  installmentNumber: null,
  counterpartyTaxId: '60872504000123',
  externalId: uuidV7Em('2026-09-16T03:00:00Z'),
}

describe('detectarDuplicatas', () => {
  it('propõe o par quando a fonte reemitiu o mesmo evento horas depois', () => {
    const pares = detectarDuplicatas([
      BASE,
      { ...BASE, id: 'tx-2', externalId: uuidV7Em('2026-09-16T06:04:00Z') },
    ])

    expect(pares).toHaveLength(1)
    expect(pares[0].manterId).toBe('tx-1')
    expect(pares[0].duplicataId).toBe('tx-2')
    expect(pares[0].minutosEntreEmissoes).toBeCloseTo(184, 0)
  })

  it('não propõe parcelas diferentes da mesma compra', () => {
    // "Westwing" x5 no mesmo dia e mesmo valor: 1/6, 2/6... sao cobrancas reais.
    const pares = detectarDuplicatas([
      { ...BASE, id: 'p1', installmentNumber: 1, externalId: uuidV7Em('2026-09-06T13:00:00Z') },
      { ...BASE, id: 'p2', installmentNumber: 2, externalId: uuidV7Em('2026-09-08T13:00:00Z') },
    ])

    expect(pares).toEqual([])
  })

  it('não propõe quando a contraparte é outra', () => {
    // Dois PIX de R$ 1.500 no mesmo dia para pessoas diferentes.
    const pares = detectarDuplicatas([
      { ...BASE, id: 'x1', counterpartyTaxId: '00824931114' },
      { ...BASE, id: 'x2', counterpartyTaxId: '48848377890', externalId: uuidV7Em('2026-09-16T09:00:00Z') },
    ])

    expect(pares).toEqual([])
  })

  it('não propõe o que veio no mesmo lote', () => {
    // Emissoes a milissegundos = a fonte mandou as duas de uma vez, entao sao
    // dois eventos, nao um repetido.
    const pares = detectarDuplicatas([
      { ...BASE, id: 'l1', externalId: uuidV7Em('2026-09-16T03:00:00Z') },
      { ...BASE, id: 'l2', externalId: uuidV7Em('2026-09-16T03:00:01Z') },
    ])

    expect(pares).toEqual([])
  })

  it('não propõe quando o external_id não é UUIDv7', () => {
    // O formato e da Polp e pode mudar. Sem o timestamp o sinal nao existe —
    // e ficar calado e melhor que propor no escuro.
    const pares = detectarDuplicatas([
      { ...BASE, id: 'o1', externalId: 'FITID-12345' },
      { ...BASE, id: 'o2', externalId: 'FITID-67890' },
    ])

    expect(pares).toEqual([])
  })

  it('não propõe valores ou datas diferentes', () => {
    const pares = detectarDuplicatas([
      BASE,
      { ...BASE, id: 'v2', amountCents: -1168541, externalId: uuidV7Em('2026-09-16T09:00:00Z') },
      { ...BASE, id: 'd2', dateISO: '2026-09-17', externalId: uuidV7Em('2026-09-16T09:00:00Z') },
    ])

    expect(pares).toEqual([])
  })

  it('mantém sempre o lançamento emitido primeiro', () => {
    // O primeiro e o que o extrato trouxe na hora do fato; o reemitido e a
    // versao enriquecida que chegou depois. Manter o mais antigo deixa a
    // escolha estavel, rode o detector quando rodar.
    const pares = detectarDuplicatas([
      { ...BASE, id: 'novo', externalId: uuidV7Em('2026-09-17T10:00:00Z') },
      { ...BASE, id: 'velho', externalId: uuidV7Em('2026-09-16T03:00:00Z') },
    ])

    expect(pares[0].manterId).toBe('velho')
    expect(pares[0].duplicataId).toBe('novo')
  })

  it('trata contraparte ausente nos dois lados como mesma contraparte', () => {
    const pares = detectarDuplicatas([
      { ...BASE, id: 'n1', counterpartyTaxId: null },
      { ...BASE, id: 'n2', counterpartyTaxId: null, externalId: uuidV7Em('2026-09-16T09:00:00Z') },
    ])

    expect(pares).toHaveLength(1)
  })
})

/**
 * O caso que a primeira versao do detector deixou passar.
 *
 * "Debito automatico DA ELETROPAULO" chegou com `counterparty_tax_id` nulo e
 * voltou 31h depois como "Enel Distribuicao Sao Paulo", ja com o CNPJ. Exigir
 * contraparte identica contradizia a propria natureza do defeito: enriquecer e
 * o ato de ADICIONAR o CNPJ que antes faltava.
 *
 * Contraparte so derruba o par quando os dois lados a declaram e discordam —
 * ai sao duas pessoas, nao um evento repetido.
 */
describe('detectarDuplicatas e a contraparte que chega depois', () => {
  it('propõe quando só a versão enriquecida trouxe o CNPJ', () => {
    const pares = detectarDuplicatas([
      { ...BASE, id: 'cru', counterpartyTaxId: null, externalId: uuidV7Em('2026-09-15T03:00:00Z') },
      { ...BASE, id: 'enriquecido', counterpartyTaxId: '61695227000193', externalId: uuidV7Em('2026-09-16T10:24:00Z') },
    ])

    // Qual dos dois fica e assunto do bloco seguinte; aqui basta que o par
    // tenha sido proposto, que e o que a contraparte ausente quase impediu.
    expect(pares).toHaveLength(1)
  })

  it('continua recusando quando os dois lados declaram contrapartes diferentes', () => {
    const pares = detectarDuplicatas([
      { ...BASE, id: 'pix1', counterpartyTaxId: '00824931114' },
      { ...BASE, id: 'pix2', counterpartyTaxId: '48848377890', externalId: uuidV7Em('2026-09-16T09:00:00Z') },
    ])

    expect(pares).toEqual([])
  })
})

/**
 * Qual das duas fica.
 *
 * "Mais antiga" seria estavel e simples, mas joga fora exatamente o que a
 * reemissao acrescentou: o CNPJ da contraparte e a categoria que vem com ele.
 * Na correcao manual do caso real ficou a "Enel Distribuicao Sao Paulo", com
 * CNPJ, e saiu a "Debito automatico DA ELETROPAULO", sem — e essa e a escolha
 * certa. A data de emissao so desempata quando as duas sabem o mesmo.
 */
describe('detectarDuplicatas escolhe qual lançamento fica', () => {
  it('mantém a versão que conhece a contraparte, mesmo sendo a mais nova', () => {
    const pares = detectarDuplicatas([
      { ...BASE, id: 'cru', counterpartyTaxId: null, externalId: uuidV7Em('2026-09-15T03:00:00Z') },
      { ...BASE, id: 'enriquecido', counterpartyTaxId: '61695227000193', externalId: uuidV7Em('2026-09-16T10:24:00Z') },
    ])

    expect(pares[0].manterId).toBe('enriquecido')
    expect(pares[0].duplicataId).toBe('cru')
  })

  it('com as duas igualmente informadas, fica a emitida primeiro', () => {
    const pares = detectarDuplicatas([
      { ...BASE, id: 'nova', externalId: uuidV7Em('2026-09-17T10:00:00Z') },
      { ...BASE, id: 'antiga', externalId: uuidV7Em('2026-09-16T03:00:00Z') },
    ])

    expect(pares[0].manterId).toBe('antiga')
  })
})
