import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }

vi.mock('@/lib/notifications/whatsapp-verification-actions', () => ({
  startWhatsAppLink: vi.fn(),
  getWhatsAppStatus: vi.fn(),
  cancelWhatsAppLink: vi.fn(async () => undefined),
  removeWhatsApp: vi.fn(async () => undefined),
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { WhatsAppConnect } from '@/app/(app)/settings/whatsapp-connect'
import { removeWhatsApp } from '@/lib/notifications/whatsapp-verification-actions'

/** Remover o número desliga os avisos e exige conectar de novo para voltar. */
describe('WhatsAppConnect — remover', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pede confirmação antes de remover o número', async () => {
    render(<WhatsAppConnect phone="+5511999998888" />)

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }))
    expect(removeWhatsApp).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Remover número' }))
    await waitFor(() => expect(removeWhatsApp).toHaveBeenCalled())
  })
})
