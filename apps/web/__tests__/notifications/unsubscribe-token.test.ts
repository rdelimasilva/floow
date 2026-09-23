import { describe, it, expect } from 'vitest'
import { signUnsubscribeToken, verifyUnsubscribeToken } from '@/lib/notifications/unsubscribe-token'

const SECRET = 'segredo-de-teste'
const USER = '6f1c2b3a-1111-4222-8333-944455556666'

describe('token de descadastro', () => {
  it('ida e volta devolve o mesmo usuário', () => {
    const token = signUnsubscribeToken(USER, SECRET)
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(USER)
  })

  it('assinatura adulterada é recusada', () => {
    const token = signUnsubscribeToken(USER, SECRET)
    const adulterado = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa')
    expect(verifyUnsubscribeToken(adulterado, SECRET)).toBeNull()
  })

  it('trocar o usuário mantendo a assinatura é recusado', () => {
    const token = signUnsubscribeToken(USER, SECRET)
    const [, sig] = token.split('.')
    const outro = Buffer.from('00000000-0000-4000-8000-000000000000').toString('base64url')
    expect(verifyUnsubscribeToken(`${outro}.${sig}`, SECRET)).toBeNull()
  })

  it('segredo diferente é recusado', () => {
    const token = signUnsubscribeToken(USER, SECRET)
    expect(verifyUnsubscribeToken(token, 'outro')).toBeNull()
  })

  it('segredo ausente nega tudo', () => {
    const token = signUnsubscribeToken(USER, SECRET)
    expect(verifyUnsubscribeToken(token, undefined)).toBeNull()
    expect(() => signUnsubscribeToken(USER, undefined)).toThrow()
  })

  it('lixo é recusado sem lançar', () => {
    expect(verifyUnsubscribeToken('', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('abc', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('a.b.c', SECRET)).toBeNull()
  })
})
