import { describe, it, expect, vi } from 'vitest'
import {
  atenderNoWhatsApp, TEXTO_ESCOLHER_ORG, TEXTO_SEM_ORG, TEXTO_INDISPONIVEL, type DepsDoWhatsApp,
} from '@/lib/consultor/whatsapp/atender'

const historico = [{ id: 'h1', role: 'user' as const, content: 'antes', createdAt: '' }]

function deps(over: Partial<DepsDoWhatsApp> = {}): DepsDoWhatsApp {
  return {
    orgsDoWhatsApp: vi.fn(async () => ({ orgIds: ['org-1'], preferida: null })),
    registrarPergunta: vi.fn(async () => ({ conversaId: 'c1', historico })),
    registrarResposta: vi.fn(async () => {}),
    marcarDigitando: vi.fn(async () => ({ ok: true })),
    enviar: vi.fn(async () => ({ ok: true as const, id: 'w' })),
    montarSystem: vi.fn(async () => 'sys'),
    responder: vi.fn(async () => ({ tipo: 'ok' as const, texto: 'Você gastou R$ 10.', sugestoes: [] })),
    appUrl: 'https://app.test',
    log: vi.fn(),
    ...over,
  }
}
const msg = { userId: 'u1', waId: '5511999998888', texto: 'quanto gastei?', wamid: 'wamid.A' }

describe('atenderNoWhatsApp', () => {
  it('fluxo feliz: grava, digitando, agente com canal whatsapp, grava e envia', async () => {
    const d = deps()
    expect(await atenderNoWhatsApp(msg, d)).toBe('respondido')
    expect(d.registrarPergunta).toHaveBeenCalledWith({ userId: 'u1', orgId: 'org-1', texto: 'quanto gastei?', wamid: 'wamid.A' })
    expect(d.marcarDigitando).toHaveBeenCalledWith('wamid.A')
    expect(d.montarSystem).toHaveBeenCalledWith('org-1', 'u1')
    expect(d.responder).toHaveBeenCalledWith({
      orgId: 'org-1', userId: 'u1', canal: 'whatsapp', historico, mensagem: 'quanto gastei?', system: 'sys',
    })
    expect(d.registrarResposta).toHaveBeenCalledWith({ userId: 'u1', conversaId: 'c1', texto: 'Você gastou R$ 10.' })
    expect(d.enviar).toHaveBeenCalledWith('+5511999998888', 'Você gastou R$ 10.')
  })

  it('org escolhida vale', async () => {
    const d = deps({ orgsDoWhatsApp: vi.fn(async () => ({ orgIds: ['org-1', 'org-2'], preferida: 'org-2' })) })
    await atenderNoWhatsApp(msg, d)
    expect(d.montarSystem).toHaveBeenCalledWith('org-2', 'u1')
  })

  it('várias orgs sem escolha: manda o link e não chama o agente', async () => {
    const d = deps({ orgsDoWhatsApp: vi.fn(async () => ({ orgIds: ['org-1', 'org-2'], preferida: null })) })
    expect(await atenderNoWhatsApp(msg, d)).toBe('escolher-org')
    expect(d.enviar).toHaveBeenCalledWith('+5511999998888', TEXTO_ESCOLHER_ORG('https://app.test'))
    expect(d.registrarPergunta).not.toHaveBeenCalled()
    expect(d.responder).not.toHaveBeenCalled()
  })

  it('sem org: avisa', async () => {
    const d = deps({ orgsDoWhatsApp: vi.fn(async () => ({ orgIds: [], preferida: null })) })
    expect(await atenderNoWhatsApp(msg, d)).toBe('sem-org')
    expect(d.enviar).toHaveBeenCalledWith('+5511999998888', TEXTO_SEM_ORG)
  })

  it('mensagem repetida: não chama o agente nem responde', async () => {
    const d = deps({ registrarPergunta: vi.fn(async () => null) })
    expect(await atenderNoWhatsApp(msg, d)).toBe('repetida')
    expect(d.responder).not.toHaveBeenCalled()
    expect(d.enviar).not.toHaveBeenCalled()
  })

  it('limite: envia o aviso e não grava resposta', async () => {
    const d = deps({ responder: vi.fn(async () => ({ tipo: 'limite' as const, texto: 'Limite atingido.', retryAfterSeconds: 9 })) })
    expect(await atenderNoWhatsApp(msg, d)).toBe('limite')
    expect(d.enviar).toHaveBeenCalledWith('+5511999998888', 'Limite atingido.')
    expect(d.registrarResposta).not.toHaveBeenCalled()
  })

  it('erro do agente: envia indisponível e loga', async () => {
    const d = deps({ responder: vi.fn(async () => { throw new Error('api') }) })
    expect(await atenderNoWhatsApp(msg, d)).toBe('erro')
    expect(d.enviar).toHaveBeenCalledWith('+5511999998888', TEXTO_INDISPONIVEL)
    expect(d.log).toHaveBeenCalled()
  })

  it('falha no digitando não impede a resposta', async () => {
    const d = deps({ marcarDigitando: vi.fn(async () => { throw new Error('meta') }) })
    expect(await atenderNoWhatsApp(msg, d)).toBe('respondido')
    expect(d.enviar).toHaveBeenCalled()
  })

  it('sem wamid: não chama o digitando e segue', async () => {
    const d = deps()
    expect(await atenderNoWhatsApp({ ...msg, wamid: undefined }, d)).toBe('respondido')
    expect(d.marcarDigitando).not.toHaveBeenCalled()
  })

  it('resposta longa sai em partes, em ordem', async () => {
    const longa = `${'a'.repeat(3000)}\n\n${'b'.repeat(3000)}`
    const d = deps({ responder: vi.fn(async () => ({ tipo: 'ok' as const, texto: longa, sugestoes: [] })) })
    await atenderNoWhatsApp(msg, d)
    expect(vi.mocked(d.enviar).mock.calls.map((c) => c[1])).toEqual(['a'.repeat(3000), 'b'.repeat(3000)])
  })
})
