import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const signInWithOtp = vi.fn(async () => ({ error: null as { message: string } | null }))
const verifyOtp = vi.fn(async () => ({ error: null as { message: string } | null }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOtp, verifyOtp } }),
}))
const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

const { MagicLinkForm } = await import('@/components/auth/magic-link-form')

async function enviarEmail() {
  render(<MagicLinkForm />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@exemplo.com' } })
  fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
  return screen.findByLabelText('Código')
}

beforeEach(() => { vi.clearAllMocks() })

describe('MagicLinkForm', () => {
  it('depois de enviar, pede o código que chegou por e-mail', async () => {
    await enviarEmail()
    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@exemplo.com' }))
  })

  it('entra com o código e vai para o dashboard', async () => {
    const campo = await enviarEmail()
    fireEvent.change(campo, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'ana@exemplo.com', token: '123456', type: 'email' })
  })

  it('código errado mostra o erro e não navega', async () => {
    verifyOtp.mockResolvedValueOnce({ error: { message: 'Token has expired or is invalid' } })
    const campo = await enviarEmail()
    fireEvent.change(campo, { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText(/código inválido ou expirado/i)).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })
})
