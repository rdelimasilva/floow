import { describe, it, expect, vi } from 'vitest'
import { handleInboundText, type InboundDeps } from '@/lib/notifications/whatsapp-inbound'

function deps(over: Partial<InboundDeps> = {}): InboundDeps {
  return {
    completeLink: vi.fn(async () => 'linked' as const),
    findUserByPhone: vi.fn(async () => ({ userId: 'u1' })),
    turnOffWhatsApp: vi.fn(async () => {}),
    reply: vi.fn(async () => ({ ok: true as const, id: 'w' })),
    consultar: vi.fn(async () => {}),
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
    expect(d.consultar).not.toHaveBeenCalled()
  })

  it('outro texto de número ligado vai para o consultor', async () => {
    const d = deps()
    const m = { from: '5511999998888', text: 'quanto gastei?', id: 'wamid.A' }
    expect(await handleInboundText(m, d)).toBe('consultor')
    expect(d.consultar).toHaveBeenCalledWith('u1', m)
    expect(d.reply).not.toHaveBeenCalled()
  })

  it('número desconhecido: não responde nem mexe em nada', async () => {
    const d = deps({ findUserByPhone: vi.fn(async () => undefined) })
    expect(await handleInboundText({ from: '5511999998888', text: 'SAIR' }, d)).toBe('unknown_sender')
    expect(d.reply).not.toHaveBeenCalled()
    expect(d.turnOffWhatsApp).not.toHaveBeenCalled()
    expect(d.consultar).not.toHaveBeenCalled()
  })

  it('wa_id sem o nono dígito procura as duas formas', async () => {
    const d = deps()
    await handleInboundText({ from: '551199998888', text: 'oi' }, d)
    expect(d.findUserByPhone).toHaveBeenCalledWith(['+551199998888', '+5511999998888'])
  })

  it('resposta que falha é logada, mas o resultado (SAIR) não muda', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const d = deps({ reply: vi.fn(async () => ({ ok: false as const, error: 'whatsapp_401: token expirado' })) })
      expect(await handleInboundText({ from: '5511999998888', text: 'sair' }, d)).toBe('stopped')
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[whatsapp] resposta falhou para •••8888: whatsapp_401: token expirado'),
      )
      expect(d.consultar).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  describe('mensagem de vínculo (floow XXXX-XXXX)', () => {
    const naoLigado = () => deps({ findUserByPhone: vi.fn(async () => undefined) })

    it('número desconhecido com código certo: liga e responde sucesso', async () => {
      const d = naoLigado()
      expect(await handleInboundText({ from: '5511999998888', text: 'floow abcd-2345' }, d)).toBe('linked')
      expect(d.completeLink).toHaveBeenCalledWith('5511999998888', 'ABCD2345')
      expect(d.findUserByPhone).not.toHaveBeenCalled()
      expect(d.reply).toHaveBeenCalledWith(
        '+5511999998888',
        'Pronto! Seu WhatsApp está ligado ao floow. Você vai receber o ritmo de gastos por aqui. Para parar, responda SAIR.',
      )
      expect(d.consultar).not.toHaveBeenCalled()
    })

    it('código inválido ou expirado: responde com o link de Configurações', async () => {
      const d = naoLigado()
      vi.mocked(d.completeLink).mockResolvedValueOnce('invalid')
      expect(await handleInboundText({ from: '5511999998888', text: 'floow ABCD2345' }, d)).toBe('link_invalid')
      expect(d.findUserByPhone).toHaveBeenCalledWith(['+5511999998888'])
      expect(d.reply).toHaveBeenCalledWith(
        '+5511999998888',
        'Código inválido ou expirado. Gere outro em Configurações: https://app.test/settings',
      )
      expect(d.consultar).not.toHaveBeenCalled()
    })

    it('código já usado mas o número já está ligado (entrega repetida da Meta): avisa que já está ligado', async () => {
      const d = deps()
      vi.mocked(d.completeLink).mockResolvedValueOnce('invalid')
      expect(await handleInboundText({ from: '551199998888', text: 'floow ABCD2345' }, d)).toBe('link_already_linked')
      expect(d.findUserByPhone).toHaveBeenCalledWith(['+551199998888', '+5511999998888'])
      expect(d.reply).toHaveBeenCalledWith('+551199998888', 'Seu WhatsApp já está ligado ao floow.')
      expect(d.consultar).not.toHaveBeenCalled()
    })

    it('número já ligado a outra conta: avisa e não liga', async () => {
      const d = naoLigado()
      vi.mocked(d.completeLink).mockResolvedValueOnce('in_use')
      expect(await handleInboundText({ from: '5511999998888', text: 'floow ABCD2345' }, d)).toBe('link_in_use')
      expect(d.reply).toHaveBeenCalledWith(
        '+5511999998888',
        'Este número já está ligado a outra conta do floow. Se não foi você, fale com o suporte.',
      )
      expect(d.consultar).not.toHaveBeenCalled()
    })

    it('limite por remetente estourado: silêncio', async () => {
      const d = naoLigado()
      vi.mocked(d.completeLink).mockResolvedValueOnce('rate_limited')
      expect(await handleInboundText({ from: '5511999998888', text: 'floow ABCD2345' }, d)).toBe('link_rate_limited')
      expect(d.reply).not.toHaveBeenCalled()
      expect(d.consultar).not.toHaveBeenCalled()
    })

    it('mensagem normal segue o fluxo antigo sem tentar vincular', async () => {
      const d = deps()
      expect(await handleInboundText({ from: '5511999998888', text: 'floow' }, d)).toBe('consultor')
      expect(d.completeLink).not.toHaveBeenCalled()
    })

    it('resposta que falha é logada com o telefone mascarado', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const d = deps({ reply: vi.fn(async () => ({ ok: false as const, error: 'whatsapp_500: x' })) })
        expect(await handleInboundText({ from: '5511999998888', text: 'floow ABCD2345' }, d)).toBe('linked')
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[whatsapp] resposta falhou para •••8888: whatsapp_500: x'),
        )
        expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('5511999998888')
        expect(d.consultar).not.toHaveBeenCalled()
      } finally {
        errorSpy.mockRestore()
      }
    })
  })
})
