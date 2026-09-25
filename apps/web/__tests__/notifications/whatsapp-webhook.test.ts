import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyMetaSignature, parseWebhook, isStopWord, maskPhone, safeEqual,
} from '@/lib/notifications/whatsapp-webhook'

const sig = (body: string, secret: string) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

describe('verifyMetaSignature', () => {
  const body = '{"a":1}'
  it('aceita assinatura correta', () => expect(verifyMetaSignature(body, sig(body, 's'), 's')).toBe(true))
  it('recusa corpo alterado', () => expect(verifyMetaSignature('{"a":2}', sig(body, 's'), 's')).toBe(false))
  it('recusa segredo errado', () => expect(verifyMetaSignature(body, sig(body, 'x'), 's')).toBe(false))
  it('recusa sem cabeçalho ou sem segredo', () => {
    expect(verifyMetaSignature(body, null, 's')).toBe(false)
    expect(verifyMetaSignature(body, sig(body, 's'), undefined)).toBe(false)
  })
  it('recusa cabeçalho sem prefixo', () => {
    expect(verifyMetaSignature(body, sig(body, 's').replace('sha256=', ''), 's')).toBe(false)
  })
})

describe('parseWebhook', () => {
  it('extrai textos e erros de entrega, ignora o resto', () => {
    const r = parseWebhook({
      entry: [{ changes: [{ value: {
        messages: [
          { from: '5511999998888', type: 'text', text: { body: 'SAIR' } },
          { from: '5511999998888', type: 'image', image: {} },
        ],
        statuses: [
          { status: 'delivered', recipient_id: '5511999998888' },
          { status: 'failed', recipient_id: '5511999998888', errors: [{ code: 131026, title: 'x' }] },
        ],
      } }] }],
    })
    expect(r.texts).toEqual([{ from: '5511999998888', text: 'SAIR' }])
    expect(r.errors).toEqual([{ recipient: '5511999998888', code: 131026, title: 'x' }])
  })

  it('lixo não lança', () => {
    expect(parseWebhook(null)).toEqual({ texts: [], errors: [] })
    expect(parseWebhook({ entry: 'x' })).toEqual({ texts: [], errors: [] })
  })
})

describe('isStopWord', () => {
  it.each(['SAIR', 'sair', ' Sair! ', 'PARAR', 'parar.', 'STOP', 'Párar'])('%s é saída', (t) =>
    expect(isStopWord(t)).toBe(true))
  it.each(['sair daqui', 'quanto gastei?', '', 'sair2', 'sa1r'])('%s não é saída', (t) =>
    expect(isStopWord(t)).toBe(false))
})

describe('utilitários', () => {
  it('maskPhone mostra só o fim', () => expect(maskPhone('5511999998888')).toBe('•••8888'))
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})
