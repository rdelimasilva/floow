import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }

vi.mock('@/lib/notifications/whatsapp-verification-actions', () => ({
  requestWhatsAppCode: vi.fn(),
  confirmWhatsAppCode: vi.fn(),
  removeWhatsApp: vi.fn(async () => undefined),
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { WhatsAppPhoneForm } from '@/app/(app)/settings/whatsapp-phone-form'
import { removeWhatsApp } from '@/lib/notifications/whatsapp-verification-actions'

/** Remover o número desliga os avisos e exige nova verificação por código para voltar. */
describe('WhatsAppPhoneForm — remover', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pede confirmação antes de remover o número', async () => {
    render(<WhatsAppPhoneForm phone="+5511999998888" />)

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }))
    expect(removeWhatsApp).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Remover número' }))
    await waitFor(() => expect(removeWhatsApp).toHaveBeenCalled())
  })
})
