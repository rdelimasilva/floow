import { describe, it, expect, vi } from 'vitest'
import {
  startLink, completeLink, parseLinkMessage, generateLinkCode, hashLinkCode, formatLinkCode,
  canonicalPhoneFromWaId, LINK_CODE_ALPHABET, LINK_CODE_TTL_MS,
  type StartLinkDeps, type CompleteLinkDeps,
} from '@/lib/notifications/whatsapp-verification'

const U = 'u1'
const NOW = new Date('2026-09-26T12:00:00Z')
const CODE = 'ABCD2345'

function startDeps(over: Partial<StartLinkDeps> = {}): StartLinkDeps {
  return {
    consumeStartQuota: vi.fn(async () => true),
    savePending: vi.fn(async () => {}),
    secret: 's',
    now: () => NOW,
    generateCode: () => CODE,
    ...over,
  }
}

function completeDeps(over: Partial<CompleteLinkDeps> = {}): CompleteLinkDeps {
  return {
    consumeSenderQuota: vi.fn(async () => true),
    claimCode: vi.fn(async () => U as string | undefined),
    markVerified: vi.fn(async () => 'ok' as const),
    secret: 's',
    ...over,
  }
}

describe('generateLinkCode', () => {
  it('8 símbolos do alfabeto sem caracteres ambíguos', () => {
    expect(LINK_CODE_ALPHABET).toBe('23456789ABCDEFGHJKMNPQRSTUVWXYZ')
    for (let i = 0; i < 200; i++) {
      expect(generateLinkCode()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/)
    }
  })

  it('não repete (aleatório de verdade)', () => {
    const codes = new Set(Array.from({ length: 500 }, generateLinkCode))
    expect(codes.size).toBe(500)
  })
})

describe('hashLinkCode / formatLinkCode', () => {
  it('HMAC hex que não depende de hífen nem de caixa e não contém o código', () => {
    const h = hashLinkCode(CODE, 's')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain(CODE)
    expect(hashLinkCode('abcd-2345', 's')).toBe(h)
    expect(hashLinkCode(CODE, 'outro')).not.toBe(h)
  })

  it('formata com hífen no meio', () => {
    expect(formatLinkCode(CODE)).toBe('ABCD-2345')
  })
})

describe('startLink', () => {
  it('grava só o hash com validade de 10 minutos e devolve o código', async () => {
    const d = startDeps()
    const r = await startLink(U, d)
    expect(r).toEqual({ ok: true, code: CODE, expiresAt: new Date(NOW.getTime() + LINK_CODE_TTL_MS) })
    expect(LINK_CODE_TTL_MS).toBe(10 * 60 * 1000)
    const saved = vi.mocked(d.savePending).mock.calls[0][0]
    expect(saved).toEqual({ userId: U, codeHash: hashLinkCode(CODE, 's'), expiresAt: new Date(NOW.getTime() + 600_000) })
    expect(JSON.stringify(saved)).not.toContain(CODE)
    expect(d.consumeStartQuota).toHaveBeenCalledWith(U)
  })

  it('gerar de novo grava por cima (um pendente por usuário, o novo hash)', async () => {
    const d = startDeps({ generateCode: vi.fn().mockReturnValueOnce(CODE).mockReturnValueOnce('WXYZ6789') })
    await startLink(U, d)
    await startLink(U, d)
    const calls = vi.mocked(d.savePending).mock.calls
    expect(calls[1][0]).toMatchObject({ userId: U, codeHash: hashLinkCode('WXYZ6789', 's') })
  })

  it('passou do limite por usuário: não gera nem grava', async () => {
    const d = startDeps({ consumeStartQuota: vi.fn(async () => false) })
    expect(await startLink(U, d)).toEqual({ ok: false, error: 'rate_limited' })
    expect(d.savePending).not.toHaveBeenCalled()
  })
})

describe('parseLinkMessage', () => {
  it.each([
    ['floow ABCD-2345', 'ABCD2345'],
    ['floow abcd-2345', 'ABCD2345'],
    ['FLOOW ABCD2345', 'ABCD2345'],
    ['  Floow   abcd2345  ', 'ABCD2345'],
    ['floow ABCD-2345', 'ABCD2345'],
  ])('%j → %s', (text, code) => {
    expect(parseLinkMessage(text)).toBe(code)
  })

  it.each([
    'floow',
    'floow ',
    'ABCD-2345',
    'floow ABCD-234',
    'floow ABCD-23456',
    'floow ABCD--2345',
    'oi, floow ABCD-2345',
    'floow ABCD-2345 obrigado',
    'meu código é floow ABCD-2345 ok',
    'floowABCD-2345',
    'sair',
    '',
  ])('%j não é mensagem de vínculo', (text) => {
    expect(parseLinkMessage(text)).toBeNull()
  })
})

describe('canonicalPhoneFromWaId', () => {
  it('com o nono dígito fica como está', () => {
    expect(canonicalPhoneFromWaId('5511999998888')).toBe('+5511999998888')
  })
  it('celular BR sem o nono dígito ganha o 9 depois do DDD', () => {
    expect(canonicalPhoneFromWaId('551199998888')).toBe('+5511999998888')
  })
  it('fixo BR (12 dígitos começando com 2 a 5) fica como veio', () => {
    expect(canonicalPhoneFromWaId('551132221234')).toBe('+551132221234')
  })
  it('número estrangeiro só ganha o +', () => {
    expect(canonicalPhoneFromWaId('14155550123')).toBe('+14155550123')
  })
})

describe('completeLink', () => {
  it('código certo: reivindica pelo hash e liga o número canônico', async () => {
    const d = completeDeps()
    expect(await completeLink('5511999998888', 'ABCD2345', d)).toBe('linked')
    expect(d.consumeSenderQuota).toHaveBeenCalledWith('5511999998888')
    expect(d.claimCode).toHaveBeenCalledWith(hashLinkCode('ABCD2345', 's'))
    expect(d.markVerified).toHaveBeenCalledWith(U, '+5511999998888')
  })

  it('wa_id sem o nono dígito liga o número com o 9', async () => {
    const d = completeDeps()
    expect(await completeLink('551199998888', 'ABCD2345', d)).toBe('linked')
    expect(d.markVerified).toHaveBeenCalledWith(U, '+5511999998888')
  })

  it('inválido ou expirado (nada reivindicado): não liga', async () => {
    const d = completeDeps({ claimCode: vi.fn(async () => undefined) })
    expect(await completeLink('5511999998888', 'ABCD2345', d)).toBe('invalid')
    expect(d.markVerified).not.toHaveBeenCalled()
  })

  it('limite por remetente: nem tenta reivindicar', async () => {
    const d = completeDeps({ consumeSenderQuota: vi.fn(async () => false) })
    expect(await completeLink('5511999998888', 'ABCD2345', d)).toBe('rate_limited')
    expect(d.claimCode).not.toHaveBeenCalled()
    expect(d.markVerified).not.toHaveBeenCalled()
  })

  it('número já ligado a outra conta: in_use', async () => {
    const d = completeDeps({ markVerified: vi.fn(async () => 'in_use' as const) })
    expect(await completeLink('5511999998888', 'ABCD2345', d)).toBe('in_use')
  })

  it('remetente que não é wa_id (só dígitos) é inválido sem tocar no banco', async () => {
    const d = completeDeps()
    expect(await completeLink('abc', 'ABCD2345', d)).toBe('invalid')
    expect(d.consumeSenderQuota).not.toHaveBeenCalled()
    expect(d.claimCode).not.toHaveBeenCalled()
  })
})
