import { describe, it, expect, vi } from 'vitest'
import { handleInboundText, type InboundDeps } from '@/lib/notifications/whatsapp-inbound'

function deps(over: Partial<InboundDeps> = {}): InboundDeps {
  return {
    findUserByPhone: vi.fn(async () => ({ userId: 'u1' })),
    turnOffWhatsApp: vi.fn(async () => {}),
    reply: vi.fn(async () => ({ ok: true as const, id: 'w' })),
    appUrl: 'https://app.test',
    ...over,
  }
}

describe('handleInboundText', () => {
  it('SAIR desliga o WhatsApp em todas as orgs e confirma', async () => {
    const d = deps()
    expect(await handleInboundText({ from: '5511999998888', text: 'sair' }, d)).toBe('stopped')
    expect(d.turnOffWhatsApp).toHaveBeenCalledWith('u1')
    expect(vi.mocked(d.reply).mock.calls[0][0]).toBe('+5511999998888')
    expect(vi.mocked(d.reply).mock.calls[0][1]).toContain('não vai mais receber')
  })

  it('outro texto recebe a resposta padrão com o link de Configurações', async () => {
    const d = deps()
    expect(await handleInboundText({ from: '5511999998888', text: 'quanto gastei?' }, d)).toBe('default_reply')
    expect(d.turnOffWhatsApp).not.toHaveBeenCalled()
    expect(vi.mocked(d.reply).mock.calls[0][1]).toContain('https://app.test/settings')
  })

  it('número desconhecido: não responde nem mexe em nada', async () => {
    const d = deps({ findUserByPhone: vi.fn(async () => undefined) })
    expect(await handleInboundText({ from: '5511999998888', text: 'SAIR' }, d)).toBe('unknown_sender')
    expect(d.reply).not.toHaveBeenCalled()
    expect(d.turnOffWhatsApp).not.toHaveBeenCalled()
  })

  it('wa_id sem o nono dígito procura as duas formas', async () => {
    const d = deps()
    await handleInboundText({ from: '551199998888', text: 'oi' }, d)
    expect(d.findUserByPhone).toHaveBeenCalledWith(['+551199998888', '+5511999998888'])
  })
})
