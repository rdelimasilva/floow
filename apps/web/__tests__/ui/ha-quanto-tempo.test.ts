import { describe, it, expect } from 'vitest'
import { haQuantoTempo } from '@/lib/ha-quanto-tempo'

const AGORA = new Date('2026-09-25T15:00:00Z')

describe('haQuantoTempo', () => {
  it('menos de um minuto', () => {
    expect(haQuantoTempo(new Date('2026-09-25T14:59:40Z'), AGORA)).toBe('agora há pouco')
  })
  it('minutos, horas e dias em pt-BR', () => {
    expect(haQuantoTempo(new Date('2026-09-25T14:45:00Z'), AGORA)).toBe('há 15 minutos')
    expect(haQuantoTempo(new Date('2026-09-25T12:00:00Z'), AGORA)).toBe('há 3 horas')
    expect(haQuantoTempo(new Date('2026-09-23T15:00:00Z'), AGORA)).toBe('há 2 dias')
  })
  it('aceita a data como texto', () => {
    expect(haQuantoTempo('2026-09-25T14:59:00Z', AGORA)).toBe('há 1 minuto')
  })
})
