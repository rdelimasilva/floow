import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'

// vi.mock é içado para o topo; o que a fábrica usa precisa vir de vi.hoisted.
const mocks = vi.hoisted(() => ({
  completeLink: vi.fn(async () => 'invalid' as const),
  findUserByPhone: vi.fn(async () => undefined as { userId: string } | undefined),
  turnOffWhatsApp: vi.fn(async () => {}),
  reply: vi.fn(async () => ({ ok: true as const, id: 'w' })),
  consultar: vi.fn(async () => {}),
}))

vi.mock('@/lib/notifications/whatsapp-inbound-deps', () => ({
  defaultInboundDeps: () => ({
    completeLink: mocks.completeLink,
    findUserByPhone: mocks.findUserByPhone,
    turnOffWhatsApp: mocks.turnOffWhatsApp,
    reply: mocks.reply,
    consultar: mocks.consultar,
    appUrl: 'https://app.test',
  }),
}))

// after() roda depois do 200: nos testes, roda na hora para poder asserir.
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: vi.fn((fn: () => unknown) => { void fn() }),
}))

import { after } from 'next/server'
import { GET, POST } from '@/app/api/webhooks/whatsapp/route'

const sig = (body: string, secret: string) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

const url = (qs: string) => `https://app.test/api/webhooks/whatsapp${qs}`
const getReq = (qs: string) => new Request(url(qs))
const postReq = (body: string, headers: Record<string, string> = {}) =>
  new Request(url(''), { method: 'POST', body, headers })

describe('GET /api/webhooks/whatsapp', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('200 com o challenge quando o modo e o token batem', async () => {
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'segredo')
    const res = await GET(getReq('?hub.mode=subscribe&hub.verify_token=segredo&hub.challenge=abc123'))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('abc123')
  })

  it('403 com token errado', async () => {
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'segredo')
    const res = await GET(getReq('?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc'))
    expect(res.status).toBe(403)
  })

  it('403 com modo errado', async () => {
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'segredo')
    const res = await GET(getReq('?hub.mode=unsubscribe&hub.verify_token=segredo&hub.challenge=abc'))
    expect(res.status).toBe(403)
  })

  it('403 sem WHATSAPP_VERIFY_TOKEN configurado', async () => {
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', '')
    const res = await GET(getReq('?hub.mode=subscribe&hub.verify_token=segredo&hub.challenge=abc'))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/webhooks/whatsapp', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('401 sem cabeçalho de assinatura', async () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', 's')
    const res = await POST(postReq('{"a":1}'))
    expect(res.status).toBe(401)
  })

  it('401 com assinatura errada', async () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', 's')
    const res = await POST(postReq('{"a":1}', { 'x-hub-signature-256': 'sha256=deadbeef' }))
    expect(res.status).toBe(401)
  })

  it('200 com assinatura válida mas corpo não é JSON', async () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', 's')
    const body = 'isto não é json'
    const res = await POST(postReq(body, { 'x-hub-signature-256': sig(body, 's') }))
    expect(res.status).toBe(200)
  })

  it('uma mensagem lançar erro não impede o processamento da seguinte, e responde 200', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      vi.stubEnv('WHATSAPP_APP_SECRET', 's')
      mocks.findUserByPhone.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined)

      const payload = {
        entry: [{ changes: [{ value: {
          messages: [
            { from: '5511999990001', type: 'text', text: { body: 'oi' } },
            { from: '5511999990002', type: 'text', text: { body: 'oi' } },
          ],
        } }] }],
      }
      const body = JSON.stringify(payload)
      const res = await POST(postReq(body, { 'x-hub-signature-256': sig(body, 's') }))
      // after() roda fora do request; espera o laço de mensagens terminar.
      await new Promise((r) => setTimeout(r, 0))

      expect(res.status).toBe(200)
      expect(mocks.findUserByPhone).toHaveBeenCalledTimes(2)
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[whatsapp] erro ao tratar mensagem de •••0001:'),
        expect.any(Error),
      )
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('after roda para payload com texto e não roda quando só há status', async () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', 's')

    const comTexto = JSON.stringify({
      entry: [{ changes: [{ value: {
        messages: [{ from: '5511999998888', type: 'text', text: { body: 'oi' } }],
      } }] }],
    })
    await POST(postReq(comTexto, { 'x-hub-signature-256': sig(comTexto, 's') }))
    expect(vi.mocked(after)).toHaveBeenCalledTimes(1)

    vi.mocked(after).mockClear()

    const soStatus = JSON.stringify({
      entry: [{ changes: [{ value: {
        statuses: [{ status: 'delivered', recipient_id: '5511999998888' }],
      } }] }],
    })
    await POST(postReq(soStatus, { 'x-hub-signature-256': sig(soStatus, 's') }))
    expect(vi.mocked(after)).not.toHaveBeenCalled()
  })
})
