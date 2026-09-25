import { describe, it, expect } from 'vitest'
import {
  decideSend, resolveFrequency, weekdayOf, isChannel, isFrequency, DEFAULT_FREQUENCY,
} from '@/lib/notifications/schedule'

const SEG = 1
const TER = 2

describe('decideSend', () => {
  it.each([
    ['daily', SEG, false, 'summary'],
    ['daily', TER, false, 'summary'],
    ['daily', TER, true, 'summary'],
    ['weekly', SEG, false, 'summary'],
    ['weekly', SEG, true, 'summary'],
    ['weekly', TER, true, 'alert'],
    ['weekly', TER, false, 'none'],
    ['alerts', SEG, true, 'alert'],
    ['alerts', SEG, false, 'none'],
    ['alerts', TER, true, 'alert'],
    ['off', SEG, true, 'none'],
    ['off', TER, true, 'none'],
  ] as const)('%s, dia %i, piora=%s -> %s', (freq, dia, piora, esperado) => {
    expect(decideSend(freq, dia, piora)).toBe(esperado)
  })
})

describe('resolveFrequency', () => {
  it('sem linha usa o padrão do canal', () => {
    expect(resolveFrequency('email', undefined, false)).toBe('alerts')
    expect(resolveFrequency('whatsapp', undefined, true)).toBe('weekly')
    expect(DEFAULT_FREQUENCY).toEqual({ email: 'alerts', whatsapp: 'weekly' })
  })
  it('linha gravada vence o padrão', () => {
    expect(resolveFrequency('email', 'off', false)).toBe('off')
    expect(resolveFrequency('whatsapp', 'daily', true)).toBe('daily')
  })
  it('WhatsApp sem número verificado é sempre off', () => {
    expect(resolveFrequency('whatsapp', 'daily', false)).toBe('off')
    expect(resolveFrequency('whatsapp', undefined, false)).toBe('off')
  })
})

describe('weekdayOf', () => {
  it('28/09/2026 é segunda', () => expect(weekdayOf('2026-09', 28)).toBe(1))
  it('27/09/2026 é domingo', () => expect(weekdayOf('2026-09', 27)).toBe(0))
  it('01/03/2028 (ano bissexto) é quarta', () => expect(weekdayOf('2028-03', 1)).toBe(3))
})

describe('guards', () => {
  it('isChannel', () => {
    expect(isChannel('email')).toBe(true)
    expect(isChannel('sms')).toBe(false)
    expect(isChannel(undefined)).toBe(false)
  })
  it('isFrequency', () => {
    expect(isFrequency('weekly')).toBe(true)
    expect(isFrequency('hourly')).toBe(false)
  })
})
