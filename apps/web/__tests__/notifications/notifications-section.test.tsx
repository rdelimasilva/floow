import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'

const m = vi.hoisted(() => ({
  setNotificationFrequency: vi.fn(async (..._a: unknown[]) => {}),
  // Horário do servidor = relógio (falso, nos testes com fake timers) do teste.
  startWhatsAppLink: vi.fn(async () => ({
    ok: true,
    code: 'ABCD-2345',
    link: 'https://wa.me/5511971773256?text=floow%20ABCD-2345',
    qrSvg: '<svg data-testid="qr"></svg>',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }) as unknown),
  getWhatsAppStatus: vi.fn(async () => ({ verified: false, phone: null, verifiedAt: null }) as unknown),
  cancelWhatsAppLink: vi.fn(async () => {}),
  removeWhatsApp: vi.fn(async () => {}),
  refresh: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('@/lib/notifications/preferences-actions', () => ({ setNotificationFrequency: m.setNotificationFrequency }))
vi.mock('@/lib/notifications/whatsapp-verification-actions', () => ({
  startWhatsAppLink: m.startWhatsAppLink,
  getWhatsAppStatus: m.getWhatsAppStatus,
  cancelWhatsAppLink: m.cancelWhatsAppLink,
  removeWhatsApp: m.removeWhatsApp,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: m.toast }) }))

import { NotificationsSection } from '@/app/(app)/settings/notifications-section'
import type { NotificationSettings } from '@/lib/notifications/notification-settings'

const T0 = new Date('2026-09-26T12:00:00.000Z')
const depois = (ms: number) => new Date(T0.getTime() + ms).toISOString()

const semNumero: NotificationSettings = {
  whatsappPhone: null,
  whatsappVerified: false,
  orgs: [
    { orgId: 'o1', orgName: 'Pessoal', frequencies: { email: 'alerts', whatsapp: 'off' } },
    { orgId: 'o2', orgName: 'Empresa', frequencies: { email: 'off', whatsapp: 'off' } },
  ],
}

describe('NotificationsSection', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockClear())
    m.getWhatsAppStatus.mockResolvedValue({ verified: false, phone: null, verifiedAt: null })
  })

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
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(T0)
    })
    afterEach(() => vi.useRealTimers())

    async function conectar(settings: NotificationSettings = semNumero) {
      const r = render(<NotificationsSection settings={settings} />)
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

      m.getWhatsAppStatus.mockResolvedValueOnce({ verified: true, phone: '+5511999998888', verifiedAt: depois(5000) })
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

    it('o prazo vem do expiresAt do servidor, não de 10 minutos contados no navegador', async () => {
      m.startWhatsAppLink.mockResolvedValueOnce({
        ok: true, code: 'ABCD-2345', link: 'https://wa.me/x', qrSvg: '<svg></svg>',
        issuedAt: depois(0), expiresAt: depois(3 * 60 * 1000),
      })
      await conectar()
      await act(async () => { await vi.advanceTimersByTimeAsync(3 * 60 * 1000 - 1000) })
      expect(screen.getByText('ABCD-2345')).toBeDefined()
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(screen.getByText('O código expirou. Gere outro.')).toBeDefined()
    })

    it('trocar: o número antigo já verificado não conta como conexão nova', async () => {
      const comNumero: NotificationSettings = {
        ...semNumero, whatsappPhone: '+5511999998888', whatsappVerified: true,
      }
      render(<NotificationsSection settings={comNumero} />)
      fireEvent.click(screen.getByRole('button', { name: 'Trocar' }))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Conectar WhatsApp' }))
      })
      expect(screen.getByText('ABCD-2345')).toBeDefined()

      // Status ainda com o número antigo, verificado antes do código ser gerado.
      m.getWhatsAppStatus.mockResolvedValue({
        verified: true, phone: '+5511999998888', verifiedAt: '2026-09-01T10:00:00.000Z',
      })
      await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
      expect(screen.getByText('ABCD-2345')).toBeDefined()
      expect(m.toast).not.toHaveBeenCalled()
      expect(m.refresh).not.toHaveBeenCalled()

      m.getWhatsAppStatus.mockResolvedValue({ verified: true, phone: '+5521988887777', verifiedAt: depois(10_000) })
      await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
      expect(m.toast).toHaveBeenCalledWith('WhatsApp conectado')
      expect(m.refresh).toHaveBeenCalled()
      expect(screen.getByText('+55 21 98888-7777')).toBeDefined()
    })

    it('cancelar o código tira ele da tela e o invalida no servidor', async () => {
      await conectar()
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(m.cancelWhatsAppLink).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('ABCD-2345')).toBeNull()
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(m.getWhatsAppStatus).not.toHaveBeenCalled()
    })

    it('"Manter" o número atual também invalida o código', async () => {
      render(<NotificationsSection settings={{ ...semNumero, whatsappPhone: '+5511999998888', whatsappVerified: true }} />)
      fireEvent.click(screen.getByRole('button', { name: 'Trocar' }))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Conectar WhatsApp' }))
      })
      fireEvent.click(screen.getByRole('button', { name: 'Manter +55 11 99999-8888' }))
      expect(m.cancelWhatsAppLink).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('ABCD-2345')).toBeNull()
    })

    it('desmontar com o código na tela para de consultar e invalida o código', async () => {
      const { unmount } = await conectar()
      unmount()
      expect(m.cancelWhatsAppLink).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(m.getWhatsAppStatus).not.toHaveBeenCalled()
    })

    it('desmontar sem código na tela não chama o cancelamento', () => {
      const { unmount } = render(<NotificationsSection settings={semNumero} />)
      unmount()
      expect(m.cancelWhatsAppLink).not.toHaveBeenCalled()
    })

    it('falha ao cancelar é ignorada', async () => {
      m.cancelWhatsAppLink.mockRejectedValueOnce(new Error('rede'))
      await conectar()
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(screen.getByRole('button', { name: 'Conectar WhatsApp' })).toBeDefined()
    })
  })
})
