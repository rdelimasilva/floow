import { describe, it, expect } from 'vitest'
import { isAuthorizedService } from '@/lib/auth/service-auth'

describe('isAuthorizedService', () => {
  it('aceita o header que bate com um dos segredos configurados', () => {
    expect(isAuthorizedService('Bearer s3cret', ['s3cret'])).toBe(true)
  })

  it('aceita quando bate com o segundo segredo (service role ou cron)', () => {
    expect(isAuthorizedService('Bearer cron-token', ['service-key', 'cron-token'])).toBe(true)
  })

  it('recusa "Bearer undefined" quando a env var nao esta definida', () => {
    expect(isAuthorizedService('Bearer undefined', [undefined])).toBe(false)
  })

  it('recusa qualquer header quando nenhum segredo esta configurado', () => {
    expect(isAuthorizedService('Bearer ', [undefined, ''])).toBe(false)
    expect(isAuthorizedService('Bearer x', [undefined, ''])).toBe(false)
  })

  it('recusa header ausente', () => {
    expect(isAuthorizedService(null, ['s3cret'])).toBe(false)
  })

  it('recusa segredo errado do mesmo tamanho', () => {
    expect(isAuthorizedService('Bearer s3crey', ['s3cret'])).toBe(false)
  })

  it('recusa segredo de tamanho diferente sem estourar', () => {
    expect(isAuthorizedService('Bearer s', ['s3cret'])).toBe(false)
  })
})
