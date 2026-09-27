import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'

const m = vi.hoisted(() => ({
  setNotificationFrequency: vi.fn(async (..._a: unknown[]) => {}),
  startWhatsAppLink: vi.fn(async () => ({
    ok: true,
    code: 'ABCD-2345',
    link: 'https://wa.me/5511971773256?text=floow%20ABCD-2345',
    qrSvg: '<svg data-testid="qr"></svg>',
    expiresAt: '2026-09-26T12:10:00.000Z',
  }) as unknown),
  getWhatsAppStatus: vi.fn(async () => ({ verified: false, phone: null }) as unknown),
  removeWhatsApp: vi.fn(async () => {}),
  refresh: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('@/lib/notifications/preferences-actions', () => ({ setNotificationFrequency: m.setNotificationFrequency }))
vi.mock('@/lib/notifications/whatsapp-verification-actions', () => ({
  startWhatsAppLink: m.startWhatsAppLink,
  getWhatsAppStatus: m.getWhatsAppStatus,
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

  it('conectar mostra o código, o link do WhatsApp e o QR', async () => {
    render(<NotificationsSection settings={semNumero} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conectar WhatsApp' }))
    expect(await screen.findByText('ABCD-2345')).toBeDefined()
    const abrir = screen.getByRole('link', { name: 'Abrir no WhatsApp' }) as HTMLAnchorElement
    expect(abrir.href).toBe('https://wa.me/5511971773256?text=floow%20ABCD-2345')
    expect(abrir.target).toBe('_blank')
    expect(screen.getByTestId('qr')).toBeDefined()
    expect(screen.getByText(/O código vale 10 minutos/)).toBeDefined()
  })

  it('WhatsApp não configurado no servidor', async () => {
    m.startWhatsAppLink.mockResolvedValueOnce({ ok: false, error: 'not_configured' })
    render(<NotificationsSection settings={semNumero} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conectar WhatsApp' }))
    expect(await screen.findByText('WhatsApp ainda não está disponível.')).toBeDefined()
  })

  it('limite de códigos por hora', async () => {
    m.startWhatsAppLink.mockResolvedValueOnce({ ok: false, error: 'rate_limited' })
    render(<NotificationsSection settings={semNumero} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conectar WhatsApp' }))
    expect(await screen.findByText('Muitos códigos gerados. Tente de novo em uma hora.')).toBeDefined()
  })

  describe('espera pela mensagem (fake timers)', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    async function conectar() {
      const r = render(<NotificationsSection settings={semNumero} />)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Conectar WhatsApp' }))
      })
      expect(screen.getByText('ABCD-2345')).toBeDefined()
      return r
    }

    it('consulta a cada 4 s e, ao verificar, mostra o número, avisa e recarrega', async () => {
      await conectar()
      await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
      expect(m.getWhatsAppStatus).toHaveBeenCalledTimes(1)
      expect(m.refresh).not.toHaveBeenCalled()

      m.getWhatsAppStatus.mockResolvedValueOnce({ verified: true, phone: '+5511999998888' })
      await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
      expect(m.refresh).toHaveBeenCalled()
      expect(m.toast).toHaveBeenCalledWith('WhatsApp conectado')
      expect(screen.getByText('+55 11 99999-8888')).toBeDefined()
      expect(screen.queryByText('ABCD-2345')).toBeNull()

      // Parou de consultar.
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
      expect(m.getWhatsAppStatus).toHaveBeenCalledTimes(2)
    })

    it('depois de 10 minutos para de consultar e pede outro código', async () => {
      await conectar()
      await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60 * 1000) })
      expect(screen.getByText('O código expirou. Gere outro.')).toBeDefined()
      expect(screen.queryByText('ABCD-2345')).toBeNull()
      const chamadas = m.getWhatsAppStatus.mock.calls.length
      expect(chamadas).toBeLessThanOrEqual(150)
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(m.getWhatsAppStatus.mock.calls.length).toBe(chamadas)
      expect(screen.getByRole('button', { name: 'Gerar outro código' })).toBeDefined()
    })

    it('desmontar para de consultar', async () => {
      const { unmount } = await conectar()
      unmount()
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(m.getWhatsAppStatus).not.toHaveBeenCalled()
    })
  })
})
