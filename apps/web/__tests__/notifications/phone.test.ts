import { describe, it, expect } from 'vitest'
import { normalizePhone, phoneCandidatesFromWaId, formatPhoneDisplay } from '@/lib/notifications/phone'

describe('normalizePhone', () => {
  it.each([
    ['(11) 99999-8888', '+5511999998888'],
    ['11999998888', '+5511999998888'],
    ['+55 11 9 9999 8888', '+5511999998888'],
    ['5511999998888', '+5511999998888'],
    ['55999998888', '+5555999998888'], // DDD 55 (Santa Maria/RS) sem DDI
    ['+1 415 555 0101', '+14155550101'],
  ])('%s -> %s', (raw, e164) => {
    expect(normalizePhone(raw)).toBe(e164)
  })

  it.each([
    [''],
    ['abc'],
    ['1199998888'], // fixo / sem o 9
    ['(01) 99999-8888'], // DDD inválido
    ['551199998888'], // BR com DDI, mas sem o 9
    ['+12'], // curto demais
    ['+1234567890123456'], // longo demais
  ])('recusa %s', (raw) => {
    expect(normalizePhone(raw)).toBeNull()
  })
})

describe('phoneCandidatesFromWaId', () => {
  it('número com o 9 vira uma forma só', () => {
    expect(phoneCandidatesFromWaId('5511999998888')).toEqual(['+5511999998888'])
  })
  it('BR sem o 9 tenta também com o 9', () => {
    expect(phoneCandidatesFromWaId('551199998888')).toEqual(['+551199998888', '+5511999998888'])
  })
  it('estrangeiro fica como veio', () => {
    expect(phoneCandidatesFromWaId('14155550101')).toEqual(['+14155550101'])
  })
})

describe('formatPhoneDisplay', () => {
  it('formata celular BR', () => {
    expect(formatPhoneDisplay('+5511999998888')).toBe('+55 11 99999-8888')
  })
  it('estrangeiro fica como está', () => {
    expect(formatPhoneDisplay('+14155550101')).toBe('+14155550101')
  })
})
