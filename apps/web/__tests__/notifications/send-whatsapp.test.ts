import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendWhatsAppTemplate, sendWhatsAppText } from '@/lib/notifications/send-whatsapp'

const ok = () =>
  vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }))

describe('send-whatsapp', () => {
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_TOKEN', 'tok')
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123')
    vi.stubEnv('WHATSAPP_API_VERSION', 'v21.0')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('envia template com parâmetros de corpo e de botão', async () => {
    const f = ok()
    const r = await sendWhatsAppTemplate(
      { to: '+5511999998888', template: 'floow_codigo', bodyParams: ['123456'], buttonParams: ['123456'] },
      f,
    )
    expect(r).toEqual({ ok: true, id: 'wamid.1' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v21.0/123/messages')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '5511999998888',
      type: 'template',
      template: {
        name: 'floow_codigo',
        language: { code: 'pt_BR' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: '123456' }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '123456' }] },
        ],
      },
    })
  })

  it('template sem botão não manda componente de botão', async () => {
    const f = ok()
    await sendWhatsAppTemplate({ to: '+5511999998888', template: 't', bodyParams: ['a'] }, f)
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.template.components).toHaveLength(1)
  })

  it('envia texto livre', async () => {
    const f = ok()
    await sendWhatsAppText('+5511999998888', 'Oi', f)
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body).toEqual({ messaging_product: 'whatsapp', to: '5511999998888', type: 'text', text: { body: 'Oi' } })
  })

  it('erro da API vira ok:false com status', async () => {
    const f = vi.fn(async () => new Response('{"error":{"code":131026}}', { status: 400 }))
    const r = await sendWhatsAppText('+5511999998888', 'Oi', f)
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/^whatsapp_400: /) })
  })

  it('timeout do fetch (AbortError) vira ok:false sem lançar', async () => {
    const f = vi.fn(async () => { throw new DOMException('The operation was aborted', 'AbortError') })
    const r = await sendWhatsAppText('+5511999998888', 'Oi', f)
    expect(r).toEqual({ ok: false, error: 'whatsapp_timeout' })
  })

  it('erro de rede (TypeError) vira ok:false com a mensagem', async () => {
    const f = vi.fn(async () => { throw new TypeError('fetch failed') })
    const r = await sendWhatsAppText('+5511999998888', 'Oi', f)
    expect(r).toEqual({ ok: false, error: 'whatsapp_network: fetch failed' })
  })

  it('sem configuração é no-op', async () => {
    vi.stubEnv('WHATSAPP_TOKEN', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = ok()
    const r = await sendWhatsAppText('+5511999998888', 'Oi', f)
    expect(r).toEqual({ ok: false, error: 'not_configured' })
    expect(f).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })
})
