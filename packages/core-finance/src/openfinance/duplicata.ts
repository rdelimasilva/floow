/**
 * O mesmo evento entregue duas vezes pela Polp, com `external_id` diferentes.
 *
 * A ingestão deduplica pelo índice único `(external_id, account_id)`, que não
 * protege quando a fonte reemite: em 16/09 o pagamento da fatura entrou como
 * "SAIDA FATURA PERSON MC BLACK" e outra vez como "Débito automático FATURA
 * PERSON MC BLACK", e R$ 11.685,40 pesaram duas vezes no saldo.
 *
 * O que NÃO distingue duplicata de compra repetida:
 *  - a descrição — difere nas duplicatas verdadeiras e é idêntica em compras
 *    legítimas ("Westwing" cinco vezes no mesmo dia, mesmo valor);
 *  - o `created_at` — as duas linhas entram no mesmo sync, mesmo milissegundo.
 *
 * O que distingue é QUANDO A POLP EMITIU cada id. O `external_id` é UUIDv7 e
 * carrega o timestamp: nos três pares reais as emissões estão a 3h, 16h e 31h
 * de distância (a fonte reemitiu ao enriquecer o lançamento), enquanto toda
 * compra repetida legítima chega no mesmo lote, a milissegundos.
 *
 * Validado contra os dados reais: 3 de 3 duplicatas verdadeiras encontradas,
 * 0 falsos positivos em 17 grupos candidatos.
 *
 * Isto PROPÕE, nunca apaga. O sinal é forte, não é prova — dois pagamentos
 * iguais à mesma contraparte em dias de emissão diferentes existem, e quem
 * sabe se aconteceram é o dono da conta.
 */

/**
 * Abaixo disto os dois ids nasceram no mesmo lote da fonte, o que significa
 * dois eventos e não um repetido. Cinco minutos é folgado de propósito: o
 * menor intervalo real observado foi de 3 horas, e o maior lote legítimo levou
 * milissegundos — não há nada na faixa entre os dois para errar.
 */
const MINUTOS_MINIMOS_ENTRE_EMISSOES = 5

export interface LancamentoParaDedupe {
  id: string
  /** Data do fato, AAAA-MM-DD. */
  dateISO: string
  amountCents: number
  /** Parcela; quando difere, são cobranças distintas da mesma compra. */
  installmentNumber: number | null
  counterpartyTaxId: string | null
  /** Id da Polp. Só UUIDv7 carrega o instante da emissão. */
  externalId: string
}

export interface ParDuplicado {
  /** O emitido primeiro — o que o extrato trouxe na hora do fato. */
  manterId: string
  /** O reemitido depois, candidato a sair. */
  duplicataId: string
  /** Distância entre as emissões: é ela que justifica a proposta na tela. */
  minutosEntreEmissoes: number
}

/**
 * Instante embutido no UUIDv7 (48 bits altos, em ms), ou `null` se o id não
 * for UUIDv7.
 *
 * O formato é da Polp e pode mudar sem aviso. Quando muda, o detector perde o
 * sinal e para de propor — degrada para silêncio, nunca para ruído.
 */
function emitidoEm(externalId: string): number | null {
  const limpo = externalId.replace(/-/g, '')
  if (limpo.length !== 32) return null
  // Nibble de versão: o 13º hex de um UUID canônico.
  if (limpo[12] !== '7') return null
  if (!/^[0-9a-f]{32}$/i.test(limpo)) return null

  const ms = parseInt(limpo.slice(0, 12), 16)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Contrapartes compatíveis.
 *
 * Só derruba o par quando os DOIS lados declaram e discordam — aí são duas
 * pessoas, não um evento repetido (dois PIX de R$ 1.500 no mesmo dia para
 * gente diferente).
 *
 * Ausente de um lado não derruba nada, e isso não é leniência: enriquecer é
 * justamente o ato de ADICIONAR o CNPJ que faltava. "Débito automático DA
 * ELETROPAULO" chegou sem contraparte e voltou 31h depois como "Enel
 * Distribuicao Sao Paulo" com o CNPJ preenchido — exigir igualdade fazia o
 * detector cegar no caso que ele existe para pegar.
 */
function contrapartesCompativeis(a: LancamentoParaDedupe, b: LancamentoParaDedupe): boolean {
  if (a.counterpartyTaxId === null || b.counterpartyTaxId === null) return true
  return a.counterpartyTaxId === b.counterpartyTaxId
}

/**
 * Parcelas diferentes são cobranças diferentes da mesma compra, nunca
 * duplicata. Parcela ausente dos dois lados não diz nada e deixa passar.
 */
function parcelasDistintas(a: LancamentoParaDedupe, b: LancamentoParaDedupe): boolean {
  if (a.installmentNumber === null && b.installmentNumber === null) return false
  return a.installmentNumber !== b.installmentNumber
}

/**
 * Qual dos dois fica.
 *
 * Manter o mais antigo seria estável e simples, mas jogaria fora justamente o
 * que a reemissão acrescentou: o CNPJ da contraparte, e a categoria que vem
 * junto dele. Na correção manual do caso real ficou a "Enel Distribuicao Sao
 * Paulo", com CNPJ, e saiu a "Débito automático DA ELETROPAULO", sem.
 *
 * A emissão só desempata quando as duas sabem o mesmo — e aí fica a primeira,
 * que é a que o extrato trouxe na hora do fato.
 */
function escolherQuemFica(
  a: LancamentoParaDedupe,
  b: LancamentoParaDedupe,
  emissaoA: number,
  emissaoB: number,
): [LancamentoParaDedupe, LancamentoParaDedupe] {
  const aSabe = a.counterpartyTaxId !== null
  const bSabe = b.counterpartyTaxId !== null

  if (aSabe !== bSabe) return aSabe ? [a, b] : [b, a]
  return emissaoA <= emissaoB ? [a, b] : [b, a]
}

/**
 * Os pares candidatos entre lançamentos DA MESMA CONTA.
 *
 * Quadrático no tamanho da entrada, e isso é aceitável porque quem chama já
 * agrupou por (conta, data, valor) no banco: os grupos têm 2 a 5 linhas.
 */
export function detectarDuplicatas(lancamentos: LancamentoParaDedupe[]): ParDuplicado[] {
  const pares: ParDuplicado[] = []

  for (let i = 0; i < lancamentos.length; i++) {
    for (let j = i + 1; j < lancamentos.length; j++) {
      const a = lancamentos[i]
      const b = lancamentos[j]

      if (a.dateISO !== b.dateISO) continue
      if (a.amountCents !== b.amountCents) continue
      if (parcelasDistintas(a, b)) continue
      if (!contrapartesCompativeis(a, b)) continue

      const emissaoA = emitidoEm(a.externalId)
      const emissaoB = emitidoEm(b.externalId)
      if (emissaoA === null || emissaoB === null) continue

      const minutosEntreEmissoes = Math.abs(emissaoA - emissaoB) / 60_000
      if (minutosEntreEmissoes <= MINUTOS_MINIMOS_ENTRE_EMISSOES) continue

      const [manter, duplicata] = escolherQuemFica(a, b, emissaoA, emissaoB)
      pares.push({ manterId: manter.id, duplicataId: duplicata.id, minutosEntreEmissoes })
    }
  }

  return pares
}
