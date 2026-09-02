/**
 * Cliente HTTP da API da Polp (Celcoin v2).
 *
 * Transporte apenas: autenticação, paginação por cursor, timeout, retry e
 * tradução de erro. Nada de regra de negócio — quem interpreta o dado é a
 * ingestão, e quem converte é `normalize.ts`.
 *
 * Duas restrições da API moldam este arquivo:
 *
 * 1. A credencial é UMA para o floow inteiro (a Polp não é multi-tenant), então
 *    o rate limit é um orçamento GLOBAL, compartilhado por todos os clientes.
 *    30 req/min nos endpoints de detalhe é pouco: polling por usuário está fora
 *    de questão, e é por isso que o fluxo principal é webhook.
 * 2. Criar consentimento consome teto REGULATÓRIO por CPF. Repetir um POST que
 *    talvez tenha funcionado é queimar cota de verdade — por isso escrita só
 *    retenta em 429, que é a única resposta que garante não ter processado.
 *
 * Ver docs/superpowers/specs/2026-09-02-openfinance-ingestion-design.md
 */
import type {
  PolpAccountTransaction,
  PolpCardTransaction,
  PolpConsent,
  PolpInstitution,
  PolpPage,
  PolpProduct,
  PolpResource,
} from './polp-types'

const DEFAULT_BASE_URL = 'https://api.polp.com.br/api/v2'

/** Só estes parâmetros chegam à URL — ver `pickTransactionQuery`. */
const TRANSACTION_QUERY_KEYS = [
  'cursor',
  'fromCreatedAt',
  'toCreatedAt',
  'fromUpdatedAt',
  'toUpdatedAt',
  'fromDate',
  'toDate',
] as const

export type TransactionQuery = Partial<Record<(typeof TRANSACTION_QUERY_KEYS)[number], string>>

export interface PolpClientConfig {
  apiClient: string
  apiSecret: string
  baseUrl?: string
  timeoutMs?: number
  /** Tentativas extras além da primeira. Padrão 3. */
  maxRetries?: number
  /** Teto de páginas por listagem, contra cursor que nunca termina. Padrão 200. */
  maxPages?: number
  fetchImpl?: typeof fetch
  /** Injetável para o teste não esperar de verdade. */
  sleep?: (ms: number) => Promise<void>
}

export class PolpApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message)
    this.name = 'PolpApiError'
  }
}

export interface CreateConsentInput {
  institutionId: string
  cpf: string
  cnpj?: string
  /** O floow manda o org_id aqui — defesa em profundidade (D3). */
  clienteUserId?: string
  /**
   * Obrigatório de propósito. Omitir `products` no POST faz a Polp solicitar os
   * CINCO produtos — conta, cartão, crédito, investimentos e câmbio. Seria pedir
   * ao usuário permissão para dado que o floow não usa, num consentimento em que
   * cada permissão é acesso real e contínuo à vida financeira dele. O wizard
   * pergunta; esta assinatura garante que a resposta chegue até aqui.
   */
  products: PolpProduct[]
  /**
   * Padrão `true`: reconectar o mesmo par CPF + instituição queima teto
   * regulatório mensal, e o duplicado não traz dado novo.
   */
  avoidDuplicates?: boolean
}

export interface PolpClient {
  listInstitutions(): Promise<PolpInstitution[]>
  createConsent(input: CreateConsentInput): Promise<PolpConsent>
  getConsent(consentId: string): Promise<PolpConsent>
  recreateConsent(consentId: string): Promise<PolpConsent>
  revokeConsent(consentId: string): Promise<void>
  listConsentResources(consentId: string): Promise<PolpResource[]>
  /** Páginas de 500 itens, buscadas sob demanda. */
  streamAccountTransactions(accountId: string, query?: TransactionQuery): AsyncGenerator<PolpAccountTransaction[]>
  streamCardTransactions(creditCardId: string, query?: TransactionQuery): AsyncGenerator<PolpCardTransaction[]>
}

/**
 * O webhook manda `query_parameters` como string crua. Ela vem de fora, então
 * é filtrada por chave conhecida antes de virar URL: repassá-la inteira deixaria
 * um payload forjado acrescentar parâmetro que a Polp interpreta.
 */
export function pickTransactionQuery(rawQueryParameters: string): TransactionQuery {
  const source = new URLSearchParams(rawQueryParameters.replace(/^\?/, ''))
  const picked: TransactionQuery = {}

  for (const key of TRANSACTION_QUERY_KEYS) {
    const value = source.get(key)
    if (value !== null && value !== '') picked[key] = value
  }

  return picked
}

export function createPolpClient(config: PolpClientConfig): PolpClient {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const timeoutMs = config.timeoutMs ?? 20000
  const maxRetries = config.maxRetries ?? 3
  const maxPages = config.maxPages ?? 200
  const doFetch = config.fetchImpl ?? fetch
  const sleep = config.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))

  async function request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(baseUrl + path)
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value)

    // Escrita só retenta em 429 — ver o cabeçalho do arquivo.
    const idempotent = method === 'GET'

    let lastError: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await doFetch(url.toString(), {
          method,
          headers: {
            'x-api-client': config.apiClient,
            'x-api-secret': config.apiSecret,
            accept: 'application/json',
            ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        })

        if (response.ok) {
          if (response.status === 204) return undefined as T
          return (await response.json()) as T
        }

        const retryAfter = parseRetryAfter(response.headers?.get?.('retry-after') ?? null)
        // O corpo do erro entra na mensagem; nunca as credenciais, que só
        // existem nos headers da requisição.
        const body = await safeText(response)
        const error = new PolpApiError(
          `Polp ${method} ${path} respondeu ${response.status}`,
          response.status,
          body,
          retryAfter,
        )

        const retriable = response.status === 429 || (idempotent && response.status >= 500)
        if (!retriable || attempt === maxRetries) throw error

        lastError = error
        await sleep(retryAfter !== null ? retryAfter * 1000 : backoffMs(attempt))
        continue
      } catch (err) {
        if (err instanceof PolpApiError) throw err

        // Rede caiu ou o timeout abortou. Repetir um POST aqui é o caso
        // perigoso: ele pode ter chegado. Só GET tenta de novo.
        if (!idempotent || attempt === maxRetries) throw err

        lastError = err
        await sleep(backoffMs(attempt))
      } finally {
        clearTimeout(timer)
      }
    }

    throw lastError
  }

  /** Percorre a paginação por cursor, uma página por vez. */
  async function* paginate<T>(path: string, query: Record<string, string> = {}): AsyncGenerator<T[]> {
    let cursor = query.cursor
    const seen = new Set<string>()

    for (let page = 0; page < maxPages; page++) {
      const response = await request<PolpPage<T>>('GET', path, {
        query: cursor ? { ...query, cursor } : query,
      })

      const items = response.data ?? []
      if (items.length > 0) yield items

      const next = response.meta?.next_cursor ?? null
      if (!next) return

      // Cursor que se repete é laço infinito com custo de rate limit.
      if (seen.has(next)) return
      seen.add(next)
      cursor = next
    }
  }

  async function collect<T>(path: string, query: Record<string, string> = {}): Promise<T[]> {
    const all: T[] = []
    for await (const page of paginate<T>(path, query)) all.push(...page)
    return all
  }

  return {
    listInstitutions() {
      return collect<PolpInstitution>('/institutions')
    },

    createConsent(input) {
      return request<PolpConsent>('POST', '/consents', {
        body: {
          institution_id: input.institutionId,
          cpf: input.cpf,
          ...(input.cnpj ? { cnpj: input.cnpj } : {}),
          ...(input.clienteUserId ? { cliente_user_id: input.clienteUserId } : {}),
          products: input.products,
          avoidDuplicates: input.avoidDuplicates ?? true,
        },
      })
    },

    getConsent(consentId) {
      return request<PolpConsent>('GET', `/consents/${encodeURIComponent(consentId)}`)
    },

    recreateConsent(consentId) {
      return request<PolpConsent>('POST', `/consents/${encodeURIComponent(consentId)}/recreate`)
    },

    async revokeConsent(consentId) {
      await request<unknown>('DELETE', `/consents/${encodeURIComponent(consentId)}`)
    },

    async listConsentResources(consentId) {
      // Esta rota não é paginada: devolve a lista inteira de uma vez.
      const response = await request<{ data?: PolpResource[] }>(
        'GET',
        `/consents/${encodeURIComponent(consentId)}/resources`,
      )
      return response.data ?? []
    },

    streamAccountTransactions(accountId, query = {}) {
      return paginate<PolpAccountTransaction>(`/accounts/${encodeURIComponent(accountId)}/transactions`, {
        ...query,
      })
    },

    streamCardTransactions(creditCardId, query = {}) {
      return paginate<PolpCardTransaction>(`/credit-cards/${encodeURIComponent(creditCardId)}/transactions`, {
        ...query,
      })
    },
  }
}

/** 500ms, 1s, 2s, 4s… com teto de 8s. */
function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 8000)
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

async function safeText(response: { text?: () => Promise<string> }): Promise<string> {
  try {
    return (await response.text?.()) ?? ''
  } catch {
    return ''
  }
}
