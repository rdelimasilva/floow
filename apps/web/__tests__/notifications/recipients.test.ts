import { describe, it, expect } from 'vitest'
import { mergeRecipients, type MemberRow } from '@/lib/notifications/recipients'

const m = (userId: string, phone: string | null, verified: boolean): MemberRow => ({
  userId, email: `${userId}@x.com`, whatsappPhone: phone, whatsappVerifiedAt: verified ? new Date() : null,
})

describe('mergeRecipients', () => {
  it('sem preferência gravada: e-mail alerts, WhatsApp weekly se verificado', () => {
    const [r] = mergeRecipients([m('u1', '+5511999998888', true)], [])
    expect(r).toEqual({
      userId: 'u1', email: 'u1@x.com', whatsappPhone: '+5511999998888',
      frequencies: { email: 'alerts', whatsapp: 'weekly' },
    })
  })

  it('número não verificado: WhatsApp off e telefone omitido', () => {
    const [r] = mergeRecipients([m('u1', '+5511999998888', false)], [])
    expect(r.whatsappPhone).toBeNull()
    expect(r.frequencies.whatsapp).toBe('off')
  })

  it('preferência gravada vence o padrão, só para o próprio usuário', () => {
    const rs = mergeRecipients(
      [m('u1', null, false), m('u2', null, false)],
      [{ userId: 'u1', channel: 'email', frequency: 'daily' }],
    )
    expect(rs.find((r) => r.userId === 'u1')!.frequencies.email).toBe('daily')
    expect(rs.find((r) => r.userId === 'u2')!.frequencies.email).toBe('alerts')
  })

  it('quem está com tudo desligado nem entra na lista', () => {
    const rs = mergeRecipients([m('u1', null, false)], [{ userId: 'u1', channel: 'email', frequency: 'off' }])
    expect(rs).toEqual([])
  })
})
