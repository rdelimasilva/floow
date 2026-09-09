/**
 * Casamento de lançamento previsto com o realizado que o banco trouxe.
 *
 * O problema: `reconcileRecurringBalances` aplica o valor PREVISTO no saldo
 * quando a data chega, e o sync depois importa o real com `externalId` novo.
 * Os dois contam. Em produção o salário de 15/07/2026 existe duas vezes —
 * R$ 32.500,00 do template e R$ 32.638,85 do Itaú.
 *
 * O risco oposto é pior que o problema: casar errado esconde um lançamento de
 * verdade. Por isso a regra tem duas faixas em vez de um limite único de
 * valor:
 *
 * - Diferença até `TOLERANCIA_ESTREITA`: aceita sem olhar a descrição. Valor
 *   quase idêntico no mesmo intervalo é evidência forte por si só, e é o caso
 *   do débito automático cujo texto do banco não lembra em nada o do template
 *   ("Pagamento de boleto HANNI DAVID IMOVEIS" contra "Aluguel, condomínio e
 *   iptu").
 * - Diferença até `TOLERANCIA_AMPLA`: exige palavra em comum na descrição.
 *   Um limite único e frouxo casaria "TIM internet" (R$ 159,00) com "Enel
 *   Distribuicao" (R$ 163,67) — fornecedores diferentes, mesmo cartão, mesma
 *   semana. Aconteceu de verdade num heurístico de investigação.
 *
 * Acima disso, nunca casa.
 */

const DIA_EM_MS = 24 * 60 * 60 * 1000

/** Janela de data. O débito automático da TIM chegou 5 dias após o previsto. */
const JANELA_DIAS = 7

/** Valor quase idêntico dispensa evidência textual. */
const TOLERANCIA_ESTREITA = 0.01

/** Acima disso só casa com palavra em comum na descrição. */
const TOLERANCIA_AMPLA = 0.08

/**
 * Palavras que o banco põe em quase toda descrição. Sem removê-las,
 * "Pagamento de boleto X" e "Pagamento de boleto Y" casariam por
 * "pagamento" — que não diz nada sobre ser a mesma despesa.
 */
const PALAVRAS_VAZIAS = new Set([
  'pagamento',
  'pagamentos',
  'pago',
  'paga',
  'debito',
  'credito',
  'automatico',
  'boleto',
  'entrada',
  'saida',
  'transferencia',
  'transf',
  'pix',
  'ted',
  'doc',
  'conta',
  'fatura',
  'parcela',
  'mensalidade',
  'recebido',
  'recebida',
  'enviado',
  'enviada',
  'para',
  'com',
  'dos',
  'das',
  'ltda',
  'sao',
  'paulo',
])

// Faixa Unicode das marcas de acentuação combinantes (U+0300-U+036F), o que
// `"á".normalize("NFD")` quebra em "a" + marca. Construída por código, não por
// regex literal, pelo mesmo motivo de `components/ui/select.tsx`: não depender
// de caractere invisível no arquivo fonte.
const MARCA_INICIO = 0x0300
const MARCA_FIM = 0x036f

function semAcento(valor: string): string {
  let saida = ''
  for (const char of valor.normalize('NFD')) {
    const code = char.codePointAt(0)!
    if (code < MARCA_INICIO || code > MARCA_FIM) saida += char
  }
  return saida
}

/** Palavras com significado de uma descrição, para comparar duas. */
function palavrasUteis(descricao: string): Set<string> {
  const palavras = new Set<string>()

  for (const bruta of semAcento(descricao).toLowerCase().split(/[^a-z0-9]+/)) {
    // Menos de 3 letras não distingue nada, e número puro é agência, conta,
    // CNPJ ou o "(7/61)" da parcela — nunca identifica o fornecedor.
    if (bruta.length < 3) continue
    if (/^\d+$/.test(bruta)) continue
    if (PALAVRAS_VAZIAS.has(bruta)) continue
    palavras.add(bruta)
  }

  return palavras
}

function temPalavraEmComum(a: string, b: string): boolean {
  const palavrasA = palavrasUteis(a)
  for (const palavra of palavrasUteis(b)) {
    if (palavrasA.has(palavra)) return true
  }
  return false
}

export interface ForecastCandidate {
  id: string
  amountCents: number
  date: Date
  description: string
}

export interface RealizedTransaction {
  amountCents: number
  date: Date
  description: string
}

function mesmoSinal(a: number, b: number): boolean {
  return (a >= 0 && b >= 0) || (a < 0 && b < 0)
}

function diferencaRelativa(previsto: number, real: number): number {
  const base = Math.abs(previsto)
  if (base === 0) return Math.abs(real) === 0 ? 0 : Number.POSITIVE_INFINITY
  return Math.abs(Math.abs(previsto) - Math.abs(real)) / base
}

/**
 * O previsto que corresponde a este realizado, ou `null`.
 *
 * Devolve o candidato de valor mais próximo entre os elegíveis, e não o
 * primeiro da lista: com duas previsões plausíveis na janela, a ordem da
 * consulta não pode decidir.
 *
 * Quem chama garante que os candidatos são da mesma conta e que nenhum já
 * está casado — o vínculo é um-para-um.
 */
export function matchForecast(
  realizado: RealizedTransaction,
  candidatos: ForecastCandidate[],
): ForecastCandidate | null {
  let melhor: ForecastCandidate | null = null
  let menorDiferenca = Number.POSITIVE_INFINITY

  for (const candidato of candidatos) {
    if (!mesmoSinal(candidato.amountCents, realizado.amountCents)) continue

    const distanciaDias =
      Math.abs(candidato.date.getTime() - realizado.date.getTime()) / DIA_EM_MS
    if (distanciaDias > JANELA_DIAS) continue

    const diferenca = diferencaRelativa(candidato.amountCents, realizado.amountCents)
    if (diferenca > TOLERANCIA_AMPLA) continue

    if (
      diferenca > TOLERANCIA_ESTREITA &&
      !temPalavraEmComum(candidato.description, realizado.description)
    ) {
      continue
    }

    if (diferenca < menorDiferenca) {
      menorDiferenca = diferenca
      melhor = candidato
    }
  }

  return melhor
}
