/**
 * Como o usuário distingue duas contas do mesmo banco.
 *
 * `GET /consents/{id}/resources` devolve só `type`, `status` e `resource_id`.
 * Quem tem dois cartões no mesmo banco veria duas linhas escritas "Cartão de
 * crédito", idênticas, e escolher errado joga o extrato de um cartão na conta
 * do outro.
 *
 * A identificação vem por uma CADEIA, não por um campo, porque em produção
 * ninguém vai abrir o payload de cada instituição para descobrir o que ela
 * manda. Em ordem de qualidade:
 *
 *   1. o detalhe do recurso (`GET /credit-cards/{id}`), onde a doc diz existir
 *      `identification` — subcampos não publicados, daí a extração tolerante
 *   2. `identification_number` de uma transação, que a doc confirma existir
 *   3. os últimos caracteres do `resource_id` — feio, porém único e sempre
 *      disponível
 *
 * O elo 3 é o que garante a promessa: **nunca duas linhas idênticas**, mesmo
 * que a instituição não mande nada dos elos 1 e 2.
 *
 * Privacidade: nada aqui guarda número completo. Só os quatro últimos dígitos
 * chegam ao banco de dados, e o payload cru do detalhe é descartado — ele pode
 * conter PAN de cartão, que não temos motivo nem direito de armazenar.
 */

export interface ResourceIdentity {
  /** Rótulo curto para a tela. Sempre preenchido. */
  label: string
  /** Quatro últimos dígitos, quando algum campo os revelou. */
  digits: string | null
  /** De qual elo da cadeia veio — serve para saber o que melhorar. */
  source: 'detail' | 'transaction' | 'fallback'
  /**
   * CHAVES encontradas no payload do detalhe, sem valores.
   *
   * Guardar as chaves ensina a forma real da resposta sem armazenar dado
   * sensível: é assim que os elos 1 e 2 vão sendo afinados sem ninguém precisar
   * inspecionar a conta de um cliente.
   */
  detailKeys: string[]
}

const TYPE_LABEL: Record<string, string> = {
  ACCOUNT: 'Conta',
  CREDIT_CARD_ACCOUNT: 'Cartão',
}

/** Agência, quando o recurso é conta: distingue duas contas no mesmo banco. */
const BRANCH_KEYS = ['branch_code', 'branchCode']

/** Chaves que costumam carregar apelido ou nome do produto. */
const NAME_KEYS = [
  'nickname',
  'alias',
  'name',
  'product_name',
  'productName',
  'brand',
  'brand_name',
  'brandName',
  'company_name',
  'network',
]

/** Chaves que costumam carregar número, mascarado ou não. */
const NUMBER_KEYS = [
  'identification_number',
  'identificationNumber',
  'masked_number',
  'maskedNumber',
  'last_digits',
  'lastDigits',
  'last_four_digits',
  'number',
  'account_number',
  'accountNumber',
  'card_number',
  'cardNumber',
  'final',
]

/** Onde procurar: raiz e os blocos que a doc menciona existirem. */
const NESTED_BLOCKS = ['identification', 'product', 'contract', 'card', 'account']

/**
 * Blocos que vêm como ARRAY de objetos, dos quais o primeiro item basta.
 *
 * Confirmado no payload real do Itaú: o final do cartão não está na raiz nem em
 * `identification` diretamente — está em `payment_methods[0].identification_number`
 * (e repetido em `limits[0]`). Varrer só objetos deixava o cartão sem final,
 * que é exatamente o dado que distingue dois cartões do mesmo banco.
 */
const NESTED_ARRAYS = ['payment_methods', 'paymentMethods', 'limits', 'accounts', 'cards']

export interface DeriveInput {
  resourceType: string
  /** Payload cru de `getResourceDetail`, ou null se a chamada falhou. */
  detail?: unknown
  /** Uma transação qualquer do recurso, para o elo 2. */
  sampleTransaction?: unknown
  polpResourceId: string
}

export function deriveResourceIdentity(input: DeriveInput): ResourceIdentity {
  const tipo = TYPE_LABEL[input.resourceType] ?? input.resourceType
  const detailKeys = collectKeys(input.detail)

  const doDetalhe = extract(input.detail)
  if (doDetalhe.digits || doDetalhe.name) {
    return {
      label: compose(tipo, doDetalhe.name ?? doDetalhe.branch, doDetalhe.digits),
      digits: doDetalhe.digits,
      source: 'detail',
      detailKeys,
    }
  }

  const daTransacao = extract(input.sampleTransaction)
  if (daTransacao.digits) {
    return {
      label: compose(tipo, null, daTransacao.digits),
      digits: daTransacao.digits,
      source: 'transaction',
      detailKeys,
    }
  }

  // Último elo: o id da Polp. Não diz nada ao usuário sobre qual cartão é, mas
  // diferencia as duas linhas — e é melhor escolher entre "Cartão ·4a2f" e
  // "Cartão ·9c71" do que entre dois rótulos iguais.
  return {
    label: `${tipo} ·${input.polpResourceId.replace(/-/g, '').slice(-4)}`,
    digits: null,
    source: 'fallback',
    detailKeys,
  }
}

function compose(tipo: string, name: string | null, digits: string | null): string {
  const partes = [tipo]
  if (name) partes.push(name)
  if (digits) partes.push(`final ${digits}`)
  return partes.join(' · ')
}

/** Procura nome e dígitos na raiz e nos blocos aninhados conhecidos. */
function extract(payload: unknown): {
  name: string | null
  digits: string | null
  branch: string | null
} {
  const escopos = scopesOf(payload)

  let name: string | null = null
  let digits: string | null = null
  let branch: string | null = null

  for (const escopo of escopos) {
    if (!digits) {
      for (const key of NUMBER_KEYS) {
        const encontrado = lastFourDigits(escopo[key])
        if (encontrado) {
          digits = encontrado
          break
        }
      }
    }

    if (!name) {
      for (const key of NAME_KEYS) {
        const valor = escopo[key]
        if (typeof valor === 'string' && valor.trim().length > 1) {
          name = valor.trim().slice(0, 40)
          break
        }
      }
    }

    if (!branch) {
      for (const key of BRANCH_KEYS) {
        const valor = escopo[key]
        if ((typeof valor === 'string' || typeof valor === 'number') && String(valor).trim()) {
          branch = `ag ${String(valor).trim().slice(0, 6)}`
          break
        }
      }
    }
  }

  return { name, digits, branch }
}

function scopesOf(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return []

  const raiz = payload as Record<string, unknown>
  const escopos = [raiz]

  for (const bloco of NESTED_BLOCKS) {
    const valor = raiz[bloco]
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      const aninhado = valor as Record<string, unknown>
      escopos.push(aninhado)
      escopos.push(...arrayScopes(aninhado))
    }
  }

  escopos.push(...arrayScopes(raiz))

  return escopos
}

/** Primeiro item de cada array conhecido — onde o final do cartão mora. */
function arrayScopes(escopo: Record<string, unknown>): Record<string, unknown>[] {
  const encontrados: Record<string, unknown>[] = []

  for (const bloco of NESTED_ARRAYS) {
    const valor = escopo[bloco]
    if (Array.isArray(valor) && valor.length > 0 && valor[0] && typeof valor[0] === 'object') {
      encontrados.push(valor[0] as Record<string, unknown>)
    }
  }

  return encontrados
}

/**
 * Os quatro últimos dígitos de um valor que pareça número de conta ou cartão.
 *
 * Corta em quatro sempre, mesmo quando o campo trouxe o número inteiro: o
 * rótulo vai para a tela e o valor vai para o banco, e nenhum dos dois precisa
 * do número completo.
 */
function lastFourDigits(valor: unknown): string | null {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null

  const digitos = String(valor).replace(/\D/g, '')
  if (digitos.length < 3) return null

  return digitos.slice(-4)
}

/** Chaves do payload, incluindo os blocos aninhados, sem nenhum valor. */
function collectKeys(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []

  const raiz = payload as Record<string, unknown>
  const chaves = Object.keys(raiz)

  for (const bloco of NESTED_BLOCKS) {
    const valor = raiz[bloco]
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      chaves.push(...Object.keys(valor as Record<string, unknown>).map((k) => `${bloco}.${k}`))
    }
  }

  return chaves.slice(0, 60)
}
