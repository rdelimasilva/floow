import { describe, it, expect } from 'vitest'
import { buildNotificationSettings } from '@/lib/notifications/notification-settings'

const orgs = [{ orgId: 'o1', orgName: 'Pessoal' }, { orgId: 'o2', orgName: 'Empresa' }]

describe('buildNotificationSettings', () => {
  it('sem número: WhatsApp off em todas as orgs, e-mail no padrão', () => {
    const s = buildNotificationSettings({ whatsappPhone: null, whatsappVerifiedAt: null }, orgs, [])
    expect(s.whatsappVerified).toBe(false)
    expect(s.orgs).toEqual([
      { orgId: 'o1', orgName: 'Pessoal', frequencies: { email: 'alerts', whatsapp: 'off' } },
      { orgId: 'o2', orgName: 'Empresa', frequencies: { email: 'alerts', whatsapp: 'off' } },
    ])
  })

  it('número verificado liga o WhatsApp semanal em todas as orgs', () => {
    const s = buildNotificationSettings({ whatsappPhone: '+5511999998888', whatsappVerifiedAt: new Date() }, orgs, [])
    expect(s.whatsappPhone).toBe('+5511999998888')
    expect(s.orgs.map((o) => o.frequencies.whatsapp)).toEqual(['weekly', 'weekly'])
  })

  it('linha gravada vale só para a org dela', () => {
    const s = buildNotificationSettings(
      { whatsappPhone: '+5511999998888', whatsappVerifiedAt: new Date() },
      orgs,
      [{ orgId: 'o2', channel: 'whatsapp', frequency: 'off' }],
    )
    expect(s.orgs.map((o) => o.frequencies.whatsapp)).toEqual(['weekly', 'off'])
  })

  it('número pendente (não verificado) não aparece como verificado', () => {
    const s = buildNotificationSettings({ whatsappPhone: '+5511999998888', whatsappVerifiedAt: null }, orgs, [])
    expect(s.whatsappVerified).toBe(false)
    expect(s.whatsappPhone).toBeNull()
  })
})
