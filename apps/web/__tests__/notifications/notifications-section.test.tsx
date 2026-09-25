import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const m = vi.hoisted(() => ({
  setNotificationFrequency: vi.fn(async (..._a: unknown[]) => {}),
  requestWhatsAppCode: vi.fn(async (..._a: unknown[]) => ({ ok: true, phone: '+5511999998888' }) as unknown),
  confirmWhatsAppCode: vi.fn(async (..._a: unknown[]) => ({ ok: true, phone: '+5511999998888' }) as unknown),
  removeWhatsApp: vi.fn(async () => {}),
  refresh: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('@/lib/notifications/preferences-actions', () => ({ setNotificationFrequency: m.setNotificationFrequency }))
vi.mock('@/lib/notifications/whatsapp-verification-actions', () => ({
  requestWhatsAppCode: m.requestWhatsAppCode,
  confirmWhatsAppCode: m.confirmWhatsAppCode,
  removeWhatsApp: m.removeWhatsApp,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: m.toast }) }))

import { NotificationsSection } from '@/app/(app)/settings/notifications-section'
import type { NotificationSettings } from '@/lib/notifications/notification-settings'

const semNumero: NotificationSettings = {
  whatsappPhone: null,
  whatsappVerified: false,
  orgs: [
    { orgId: 'o1', orgName: 'Pessoal', frequencies: { email: 'alerts', whatsapp: 'off' } },
    { orgId: 'o2', orgName: 'Empresa', frequencies: { email: 'off', whatsapp: 'off' } },
  ],
}

describe('NotificationsSection', () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockClear()))

  it('mostra uma linha por org com a frequência atual', () => {
    render(<NotificationsSection settings={semNumero} />)
    expect((screen.getByLabelText('E-mail — Pessoal') as HTMLSelectElement).value).toBe('alerts')
    expect((screen.getByLabelText('E-mail — Empresa') as HTMLSelectElement).value).toBe('off')
  })

  it('WhatsApp fica desabilitado sem número verificado', () => {
    render(<NotificationsSection settings={semNumero} />)
    expect((screen.getByLabelText('WhatsApp — Pessoal') as HTMLSelectElement).disabled).toBe(true)
  })

  it('WhatsApp habilitado com número verificado', () => {
    render(
      <NotificationsSection
        settings={{
          ...semNumero, whatsappPhone: '+5511999998888', whatsappVerified: true,
          orgs: semNumero.orgs.map((o) => ({ ...o, frequencies: { ...o.frequencies, whatsapp: 'weekly' } })),
        }}
      />,
    )
    const sel = screen.getByLabelText('WhatsApp — Pessoal') as HTMLSelectElement
    expect(sel.disabled).toBe(false)
    expect(sel.value).toBe('weekly')
    expect(screen.getByText('+55 11 99999-8888')).toBeDefined()
  })

  it('trocar a frequência grava só aquela org e canal', async () => {
    render(<NotificationsSection settings={semNumero} />)
    fireEvent.change(screen.getByLabelText('E-mail — Empresa'), { target: { value: 'daily' } })
    await waitFor(() => expect(m.setNotificationFrequency).toHaveBeenCalledWith('o2', 'email', 'daily'))
  })

  it('se gravar falha, volta o valor anterior', async () => {
    m.setNotificationFrequency.mockRejectedValueOnce(new Error('x'))
    render(<NotificationsSection settings={semNumero} />)
    const sel = screen.getByLabelText('E-mail — Pessoal') as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'daily' } })
    await waitFor(() => expect(sel.value).toBe('alerts'))
  })

  it('cadastro do número: envia código, confirma e recarrega', async () => {
    render(<NotificationsSection settings={semNumero} />)
    fireEvent.change(screen.getByLabelText('Número de WhatsApp'), { target: { value: '(11) 99999-8888' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
    await waitFor(() => expect(m.requestWhatsAppCode).toHaveBeenCalledWith('(11) 99999-8888'))

    fireEvent.change(await screen.findByLabelText('Código recebido'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(m.confirmWhatsAppCode).toHaveBeenCalledWith('123456'))
    await waitFor(() => expect(m.refresh).toHaveBeenCalled())
  })

  it('mostra o motivo quando o número já está em uso', async () => {
    m.requestWhatsAppCode.mockResolvedValueOnce({ ok: false, error: 'in_use' })
    render(<NotificationsSection settings={semNumero} />)
    fireEvent.change(screen.getByLabelText('Número de WhatsApp'), { target: { value: '11999998888' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
    expect(await screen.findByText('Este número já está em uso em outra conta do floow.')).toBeDefined()
  })
})
