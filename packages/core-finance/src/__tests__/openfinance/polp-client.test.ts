import { describe, expect, it } from 'vitest'
import {
  createPolpClient,
  PolpApiError,
  pickTransactionQuery,
  type PolpClientConfig,
} from '../../openfinance/polp-client'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

/** Devolve as respostas na ordem em que foram passadas e registra as chamadas. */
function harness(responses: ReturnType<typeof fakeResponse>[], overrides: Partial<PolpClientConfig> = {}) {
  const calls: Call[] = []
  const slept: number[] = []

  const client = createPolpClient({
    apiClient: 'client_abc',
    apiSecret: 'secret_xyz',
    baseUrl: 'https://api.polp.test/api/v2',
    sleep: async (ms) => {
      slept.push(ms)
    },
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        headers: init.headers as Record<string, string>,
        body: init.body ? JSON.parse(init.body as string) : undefined,
      })
      const next = responses.shift()
      if (!next) throw new Error('fetch chamado mais vezes que o teste previu')
      return next
    }) as unknown as typeof fetch,
    ...overrides,
  })

  return { client, calls, slept }
}

const consent = { id: 'consent-1', status: 'AWAITING_AUTHORIZATION' }

describe('createPolpClient — autenticação e corpo', () => {
  it('manda as credenciais em header, nunca na URL', async () => {
    const { client, calls } = harness([fakeResponse(200, consent)])
    await client.getConsent('consent-1')

    expect(calls[0].url).toBe('https://api.polp.test/api/v2/consents/consent-1')
    expect(calls[0].headers['x-api-client']).toBe('client_abc')
    expect(calls[0].headers['x-api-secret']).toBe('secret_xyz')
    // Segredo em query string vaza em log de proxy e em histórico de servidor.
    expect(calls[0].url).not.toContain('secret')
  })

  it('traduz a entrada para o snake_case da Polp e pede avoidDuplicates', async () => {
    const { client, calls } = harness([fakeResponse(201, consent)])
    await client.createConsent({
      institutionId: 'inst-1',
      cpf: '12345678900',
      clienteUserId: 'org-1',
      products: ['ACCOUNT'],
    })

    expect(calls[0].body).toEqual({
      institution_id: 'inst-1',
      cpf: '12345678900',
      cliente_user_id: 'org-1',
      products: ['ACCOUNT'],
      // Reconectar o mesmo CPF na mesma instituição queima teto regulatório.
      avoidDuplicates: true,
    })
  })

  it('não inventa cnpj em conexão pessoal', async () => {
    const { client, calls } = harness([fakeResponse(201, consent)])
    await client.createConsent({ institutionId: 'inst-1', cpf: '12345678900' })

    expect(calls[0].body).not.toHaveProperty('cnpj')
  })

  it('aceita 204 sem corpo na revogação', async () => {
    const { client } = harness([fakeResponse(204, '')])
    await expect(client.revokeConsent('consent-1')).resolves.toBeUndefined()
  })
})

describe('createPolpClient — erros e retry', () => {
  it('respeita o Retry-After do 429 em vez de insistir no escuro', async () => {
    const { client, slept, calls } = harness([
      fakeResponse(429, { message: 'Too Many Attempts.' }, { 'retry-after': '3' }),
      fakeResponse(200, consent),
    ])

    await client.getConsent('consent-1')

    expect(calls).toHaveLength(2)
    expect(slept).toEqual([3000])
  })

  it('não repete escrita que pode ter sido processada', async () => {
    // 500 num POST /consents pode ter criado o consentimento assim mesmo, e
    // repetir queima teto regulatório por CPF. Só 429 garante que não passou.
    const { client, calls } = harness([fakeResponse(500, { message: 'boom' })])

    await expect(client.createConsent({ institutionId: 'i', cpf: '1' })).rejects.toBeInstanceOf(PolpApiError)
    expect(calls).toHaveLength(1)
  })

  it('repete leitura que falhou no servidor', async () => {
    const { client, calls } = harness([fakeResponse(503, 'indisponível'), fakeResponse(200, consent)])

    await client.getConsent('consent-1')
    expect(calls).toHaveLength(2)
  })

  it('desiste com erro tipado depois do teto de tentativas', async () => {
    const { client, calls } = harness(
      [fakeResponse(503, 'x'), fakeResponse(503, 'x'), fakeResponse(503, 'x')],
      { maxRetries: 2 },
    )

    const err = await client.getConsent('c').catch((e) => e)
    expect(err).toBeInstanceOf(PolpApiError)
    expect(err.status).toBe(503)
    expect(calls).toHaveLength(3)
  })

  it('não repete erro de cliente, que repetir não conserta', async () => {
    const { client, calls } = harness([fakeResponse(404, { message: 'não encontrado' })])

    await expect(client.getConsent('c')).rejects.toBeInstanceOf(PolpApiError)
    expect(calls).toHaveLength(1)
  })
})

describe('createPolpClient — paginação', () => {
  it('segue o next_cursor até acabar', async () => {
    const { client, calls } = harness([
      fakeResponse(200, { data: [{ id: 'a' }], meta: { next_cursor: 'cur-2' } }),
      fakeResponse(200, { data: [{ id: 'b' }], meta: { next_cursor: null } }),
    ])

    const ids: string[] = []
    for await (const page of client.streamAccountTransactions('acc-1')) {
      ids.push(...page.map((t) => t.id))
    }

    expect(ids).toEqual(['a', 'b'])
    expect(calls[0].url).toContain('/accounts/acc-1/transactions')
    expect(calls[1].url).toContain('cursor=cur-2')
  })

  it('para quando o cursor se repete, em vez de girar para sempre', async () => {
    // Cursor que não avança é laço infinito consumindo rate limit — que é
    // global, compartilhado por todos os clientes do floow.
    const { client, calls } = harness([
      fakeResponse(200, { data: [{ id: 'a' }], meta: { next_cursor: 'mesmo' } }),
      fakeResponse(200, { data: [{ id: 'b' }], meta: { next_cursor: 'mesmo' } }),
    ])

    const ids: string[] = []
    for await (const page of client.streamCardTransactions('card-1')) {
      ids.push(...page.map((t) => t.id))
    }

    expect(ids).toEqual(['a', 'b'])
    expect(calls).toHaveLength(2)
  })

  it('repassa a janela de datas do evento', async () => {
    const { client, calls } = harness([fakeResponse(200, { data: [], meta: {} })])

    for await (const _ of client.streamAccountTransactions('acc-1', {
      fromUpdatedAt: '2026-09-01T00:00:00Z',
    })) {
      // consumir o gerador
    }

    expect(calls[0].url).toContain('fromUpdatedAt=2026-09-01')
  })

  it('devolve a lista completa dos recursos, que não é paginada', async () => {
    const { client, calls } = harness([
      fakeResponse(200, { data: [{ type: 'ACCOUNT', status: 'AVAILABLE', resource_id: 'r-1' }] }),
    ])

    const resources = await client.listConsentResources('consent-1')
    expect(resources).toHaveLength(1)
    expect(calls).toHaveLength(1)
  })
})

describe('pickTransactionQuery', () => {
  it('mantém só os parâmetros conhecidos da listagem', () => {
    // `query_parameters` chega no payload do webhook. Repassá-lo cru deixaria
    // um evento forjado acrescentar parâmetro à chamada.
    const picked = pickTransactionQuery(
      'fromUpdatedAt=2026-09-01T00:00:00Z&toUpdatedAt=2026-09-02T00:00:00Z&admin=1&per_page=99999',
    )

    expect(picked).toEqual({
      fromUpdatedAt: '2026-09-01T00:00:00Z',
      toUpdatedAt: '2026-09-02T00:00:00Z',
    })
  })

  it('aceita a string com ou sem a interrogação', () => {
    expect(pickTransactionQuery('?fromDate=2026-09-01')).toEqual({ fromDate: '2026-09-01' })
    expect(pickTransactionQuery('')).toEqual({})
  })
})
