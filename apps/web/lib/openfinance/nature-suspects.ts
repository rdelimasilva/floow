import { foldForMatch, foldForRuleMatch } from './nature-rules'

/**
 * Detector de despesas que provavelmente não são gasto.
 *
 * Função pura, sem I/O: recebe as candidatas, os cartões conectados e as
 * transferências que já existem na conta, e devolve grupos com o motivo da
 * suspeita. NÃO escreve nada e NÃO reclassifica nada — quem decide é o usuário,
 * pela ação da camada de regras.
 *
 * Ver docs/superpowers/specs/2026-09-03-openfinance-nature-reclassification-design.md
 */

export interface SuspectCandidate {
  id: string
  accountId: string
  accountName: string
  description: string
  /** Negativo: são despesas. */
  amountCents: number
  categoryRef: string | null
  polpType: string | null
}

/** Cartão conectado e vinculado, para o sinal (a). */
export interface ConnectedCard {
  /** Rótulo do recurso mais o nome da conta espelho, para maximizar tokens. */
  label: string
  /** Últimos quatro dígitos, quando a Polp os revelou. */
  digits: string | null
}

/** Transação já classificada como transferência, para o sinal (c). */
export interface KnownTransfer {
  accountId: string
  description: string
}

export type SuspectSignal =
  | { kind: 'connected-card'; cardLabel: string }
  | { kind: 'investment-vocabulary'; token: string }
  | { kind: 'polp-contradiction'; transferDescription: string }

export interface SuspectGroup {
  /** Descrição normalizada. É o `match_value` que a regra vai gravar. */
  key: string
  /** Uma descrição crua do grupo, para mostrar na tela. */
  sample: string
  accountId: string
  accountName: string
  count: number
  /** Soma em centavos, negativa. */
  totalCents: number
  transactionIds: string[]
  signals: SuspectSignal[]
  /**
   * O banco mandou rótulo genérico neste grupo. Nunca admite um grupo sozinho:
   * metade da conta corrente cai em `OTHER` ou `OUTROS`, e usar isso como
   * critério encheria o painel de lixo. Serve para o texto do motivo.
   */
  structuralHint: boolean
}

/**
 * Tokens do nome do cartão que não identificam nada.
 *
 * `displayLabel` vem no formato "Cartão · PERSONNALITE MC BLACK · final 1234";
 * sem esta lista, `CARTAO` e `FINAL` casariam com meio extrato.
 */
const GENERIC_CARD_TOKENS = new Set([
  'CARTAO', 'CARD', 'CONTA', 'FINAL', 'MC', 'VISA', 'MASTER', 'MASTERCARD',
  'ELO', 'AMEX', 'CREDITO', 'CREDIT', 'DEBITO', 'BANCO',
])

/** Vocabulário de investimento. Casado por token inteiro, nunca por substring. */
const INVESTMENT_TOKENS = new Set([
  'APLICACAO', 'APLICACOES', 'RESGATE', 'CDB', 'RDB', 'LCI', 'LCA',
  'TESOURO', 'FUNDO', 'FUNDOS', 'POUPANCA', 'PREVIDENCIA', 'DI',
])

/** Expressões que, com um token de cartão, bastam para suspeitar de fatura. */
const BILL_PAYMENT_PHRASES = ['DEBITO AUTOMATICO', 'PAGAMENTO', 'FATURA']

/**
 * Piso para o grupo aparecer: três lançamentos OU mil reais.
 *
 * Sem piso o painel listaria quarenta grupos de trinta reais e ninguém abriria
 * o segundo. O `OU` existe porque um único pagamento de fatura de R$ 50 mil
 * merece a pergunta tanto quanto doze de R$ 100.
 */
const MIN_GROUP_COUNT = 3
const MIN_GROUP_CENTS = 100_000

/**
 * Chave de agrupamento.
 *
 * A mesma operação repetida todo mês chega com data e número diferentes no meio
 * da descrição ("Débito automático PERS BLACK 12/08 1234"). Agrupar pela
 * descrição crua daria doze grupos de um lançamento cada, e nenhum passaria do
 * piso.
 */
export function groupKey(description: string): string {
  // Delega para `nature-rules.ts`: é a MESMA normalização que a comparação de
  // regra `contains` usa do outro lado. `nature-suspects` já importa de
  // `nature-rules`, nunca o contrário, então delegar aqui não cria ciclo.
  return foldForRuleMatch(description)
}

function tokensOf(value: string): string[] {
  return foldForMatch(value)
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 0)
}

/**
 * A descrição casa com um cartão conectado?
 *
 * O nome comercial não aparece inteiro na descrição: o banco abrevia
 * "PERSONNALITE" para "PERS". Por isso o casamento é por prefixo de quatro
 * caracteres, nas duas direções.
 *
 * Exige DOIS tokens distintivos, ou um token mais uma expressão de pagamento.
 * Com um token só, "Compra BLACK FRIDAY" viraria suspeita de fatura do
 * "PERSONNALITE MC BLACK" — e um detector que erra assim ensina o usuário a
 * ignorar o alerta.
 */
function matchesConnectedCard(rawDescription: string, card: ConnectedCard): boolean {
  const descTokens = tokensOf(rawDescription)
  const cardTokens = tokensOf(card.label).filter(
    (token) => token.length >= 3 && !GENERIC_CARD_TOKENS.has(token) && !/^\d+$/.test(token),
  )

  let hits = 0
  for (const cardToken of cardTokens) {
    const casou = descTokens.some(
      (descToken) =>
        descToken.length >= 4 &&
        (cardToken.startsWith(descToken) || descToken.startsWith(cardToken.slice(0, 4))),
    )
    if (casou) hits++
  }

  if (card.digits && descTokens.includes(card.digits)) hits++
  if (hits >= 2) return true

  const folded = foldForMatch(rawDescription)
  return hits === 1 && BILL_PAYMENT_PHRASES.some((phrase) => folded.includes(phrase))
}

/** Primeiro token de investimento da chave, ou null. */
function investmentToken(key: string): string | null {
  for (const token of tokensOf(key)) {
    if (INVESTMENT_TOKENS.has(token)) return token
  }
  return null
}

/** Transferência com os tokens já extraídos, agrupadas por conta. */
interface PreparedTransfer {
  description: string
  /** Descrição normalizada pela MESMA função que produz a chave do grupo. */
  key: string
  /** Todos os tokens, para o teste de continência da chave do grupo. */
  tokens: Set<string>
}

/**
 * Tokeniza as transferências UMA vez, antes do laço de grupos.
 *
 * `contradictingTransfer` é chamada por grupo e varre a lista inteira. Sem este
 * pré-cálculo, 200 grupos contra 1.000 transferências davam 200 mil chamadas de
 * `tokensOf` — cada uma um `normalize('NFD')` mais regex mais split — a cada
 * carregamento de `/transactions`.
 *
 * O `Map` por conta também elimina a varredura das transferências das outras
 * contas, que o sinal descarta de qualquer jeito.
 */
function prepareTransfers(transfers: KnownTransfer[]): Map<string, PreparedTransfer[]> {
  const porConta = new Map<string, PreparedTransfer[]>()

  for (const transfer of transfers) {
    const prepared: PreparedTransfer = {
      description: transfer.description,
      key: groupKey(transfer.description),
      tokens: new Set(tokensOf(transfer.description)),
    }
    const lista = porConta.get(transfer.accountId)
    if (lista) lista.push(prepared)
    else porConta.set(transfer.accountId, [prepared])
  }

  return porConta
}

/**
 * A Polp classificou a mesma coisa como transferência em outro lançamento da
 * mesma conta?
 *
 * "Saída APLICACAO CDB DI" virou transferência e "Aplicação CDB DI" virou
 * despesa — a mesma operação, dois rótulos, na mesma conta. É o sinal mais
 * forte daqui e o único que não depende de vocabulário nenhum: é evidência do
 * próprio dado do usuário.
 *
 * O critério é CONTINÊNCIA: a descrição da transferência tem que conter TODOS
 * os tokens da chave do grupo. É a tradução literal de "o banco descreveu esta
 * mesma coisa como transferência", e o banco só acrescenta ("Saída APLICACAO
 * CDB DI", "Débito automático PERS BLACK 3608-0884"), nunca tira.
 *
 * Contar tokens em comum foi o critério anterior e não funciona. Descrição de
 * extrato brasileiro abre com um envelope burocrático — "Pagamento de Pix QR
 * Code", "Débito automático" — que sozinho entregava os dois tokens que a
 * regra pedia: medido contra o extrato real de uma org, o sinal marcava 30
 * grupos e R$ 537 mil, 81% de TUDO que a pessoa gastou. Um painel que aponta
 * para quase tudo não aponta para nada.
 *
 * Duas variantes mais fracas foram medidas contra o mesmo extrato e caíram:
 * exigir uma PROPORÇÃO dos tokens deixava passar qualquer outro Pix da conta
 * contra "PAGAMENTO DE PIX QR CODE CLIENTBASE LTDA", porque o envelope ocupa
 * quatro dos cinco tokens da chave; e uma stoplist de palavras burocráticas
 * cobria o envelope e não cobria "SAO PAULO", que casava "Estado de São Paulo"
 * com um estacionamento rotativo. Não há lista que termine — nome de cidade,
 * sufixo societário e primeiro nome comum entram todos na mesma armadilha.
 *
 * Com um token só na chave, continência vira "qualquer transferência que
 * mencione a palavra": "Aluguel" casaria com qualquer uma que falasse de
 * aluguel. Por isso o token único exige a descrição normalizada IDÊNTICA dos
 * dois lados, que é o caso de "Onr" contra "Onr".
 */
function contradictingTransfer(
  accountId: string,
  key: string,
  transfersByAccount: Map<string, PreparedTransfer[]>,
): string | null {
  // Abaixo de três caracteres não identifica nada e o banco abrevia à vontade:
  // "DI", "S", "A" entrariam na continência e só serviriam para reprová-la.
  const keyTokens = tokensOf(key).filter((token) => token.length >= 3)
  if (keyTokens.length === 0) return null

  for (const transfer of transfersByAccount.get(accountId) ?? []) {
    if (keyTokens.length < 2 && transfer.key !== key) continue
    if (keyTokens.every((token) => transfer.tokens.has(token))) return transfer.description
  }

  return null
}

/** O banco mandou rótulo genérico nesta linha? Reforço, nunca critério. */
function isStructural(candidate: SuspectCandidate): boolean {
  return (
    candidate.categoryRef === 'OTHER' ||
    candidate.categoryRef?.startsWith('BANK_FEES_') === true ||
    candidate.polpType === 'OUTROS' ||
    candidate.polpType === 'TARIFA_SERVICOS_AVULSOS'
  )
}

export interface DetectInput {
  candidates: SuspectCandidate[]
  cards: ConnectedCard[]
  knownTransfers: KnownTransfer[]
}

export function detectNatureSuspects({
  candidates,
  cards,
  knownTransfers,
}: DetectInput): SuspectGroup[] {
  interface Bucket extends SuspectGroup {
    rawSamples: string[]
  }

  const buckets = new Map<string, Bucket>()

  for (const candidate of candidates) {
    const key = groupKey(candidate.description)
    if (!key) continue

    // \u0000 nunca aparece numa descrição: separador seguro entre conta e chave.
    const bucketKey = `${candidate.accountId}\u0000${key}`
    let bucket = buckets.get(bucketKey)

    if (!bucket) {
      bucket = {
        key,
        sample: candidate.description,
        accountId: candidate.accountId,
        accountName: candidate.accountName,
        count: 0,
        totalCents: 0,
        transactionIds: [],
        signals: [],
        structuralHint: false,
        rawSamples: [],
      }
      buckets.set(bucketKey, bucket)
    }

    bucket.count++
    bucket.totalCents += candidate.amountCents
    bucket.transactionIds.push(candidate.id)
    bucket.rawSamples.push(candidate.description)
    if (isStructural(candidate)) bucket.structuralHint = true
  }

  const groups: SuspectGroup[] = []
  // Fora do laço: uma passada pelas transferências, não uma por grupo.
  const transfersByAccount = prepareTransfers(knownTransfers)

  for (const bucket of buckets.values()) {
    if (bucket.count < MIN_GROUP_COUNT && Math.abs(bucket.totalCents) < MIN_GROUP_CENTS) continue

    const signals: SuspectSignal[] = []

    for (const card of cards) {
      if (bucket.rawSamples.some((description) => matchesConnectedCard(description, card))) {
        signals.push({ kind: 'connected-card', cardLabel: card.label })
        break
      }
    }

    const token = investmentToken(bucket.key)
    if (token) signals.push({ kind: 'investment-vocabulary', token })

    const transferDescription = contradictingTransfer(
      bucket.accountId,
      bucket.key,
      transfersByAccount,
    )
    if (transferDescription) signals.push({ kind: 'polp-contradiction', transferDescription })

    // Nenhum sinal, nenhuma pergunta. O sinal estrutural não conta aqui.
    if (signals.length === 0) continue

    const { rawSamples: _ignored, ...group } = bucket
    groups.push({ ...group, signals })
  }

  return groups.sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents))
}

/** O motivo da suspeita, em português, para a tela. */
export function explainSuspect(group: SuspectGroup): string {
  const parts = group.signals.map((signal) => {
    switch (signal.kind) {
      case 'connected-card':
        return `casa com seu cartão ${signal.cardLabel}, que está conectado ao floow`
      case 'investment-vocabulary':
        return `parece movimentação de investimento ("${signal.token}")`
      case 'polp-contradiction':
        return `o banco classificou "${signal.transferDescription}" como transferência, e isto parece a mesma operação`
    }
  })

  if (group.structuralHint) {
    parts.push('e o rótulo que o banco mandou é genérico')
  }

  return parts.join('; ')
}
