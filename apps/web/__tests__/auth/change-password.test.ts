import { describe, it, expect, vi, beforeEach } from 'vitest'
import { changePassword } from '@/lib/auth/change-password'

type Resposta = { error: { code?: string; message?: string } | null }

function fakeSupabase() {
  const updateUser = vi.fn<(...a: unknown[]) => Promise<Resposta>>()
  const reauthenticate = vi.fn<() => Promise<Resposta>>(async () => ({ error: null }))
  return { auth: { updateUser, reauthenticate } }
}

const REAUTH_ERROR = {
  code: 'reauthentication_needed',
  message: 'A reauthentication is needed to change the password',
}

let supabase: ReturnType<typeof fakeSupabase>

beforeEach(() => {
  vi.clearAllMocks()
  supabase = fakeSupabase()
})

describe('changePassword', () => {
  it('troca a senha direto quando a sessão é recente', async () => {
    supabase.auth.updateUser.mockResolvedValue({ error: null })

    const r = await changePassword(supabase as never, { password: 'senha-nova-123' })

    expect(r).toEqual({ status: 'success' })
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'senha-nova-123' })
    expect(supabase.auth.reauthenticate).not.toHaveBeenCalled()
  })

  it('pede o código por e-mail quando o Supabase exige reautenticação', async () => {
    supabase.auth.updateUser.mockResolvedValue({ error: REAUTH_ERROR })

    const r = await changePassword(supabase as never, { password: 'senha-nova-123' })

    expect(r).toEqual({ status: 'nonce_required' })
    expect(supabase.auth.reauthenticate).toHaveBeenCalledOnce()
  })

  it('reconhece a exigência de reautenticação pela mensagem, sem depender do code', async () => {
    supabase.auth.updateUser.mockResolvedValue({
      error: { message: 'A reauthentication is needed to change the password' },
    })

    const r = await changePassword(supabase as never, { password: 'senha-nova-123' })

    expect(r).toEqual({ status: 'nonce_required' })
  })

  it('envia o nonce junto quando o usuário informa o código', async () => {
    supabase.auth.updateUser.mockResolvedValue({ error: null })

    const r = await changePassword(supabase as never, { password: 'senha-nova-123', nonce: '123456' })

    expect(r).toEqual({ status: 'success' })
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({
      password: 'senha-nova-123',
      nonce: '123456',
    })
  })

  it('não entra em laço: com nonce já informado, não dispara outro e-mail', async () => {
    supabase.auth.updateUser.mockResolvedValue({ error: REAUTH_ERROR })

    const r = await changePassword(supabase as never, { password: 'senha-nova-123', nonce: '000000' })

    expect(r.status).toBe('error')
    expect(supabase.auth.reauthenticate).not.toHaveBeenCalled()
  })

  it('devolve erro quando o envio do código falha', async () => {
    supabase.auth.updateUser.mockResolvedValue({ error: REAUTH_ERROR })
    supabase.auth.reauthenticate.mockResolvedValue({
      error: { message: 'For security purposes, you can only request this after 60 seconds.' },
    })

    const r = await changePassword(supabase as never, { password: 'senha-nova-123' })

    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.message).toMatch(/60 seconds/)
  })

  it('propaga outros erros sem transformar em pedido de código', async () => {
    supabase.auth.updateUser.mockResolvedValue({
      error: { code: 'weak_password', message: 'Password is too weak' },
    })

    const r = await changePassword(supabase as never, { password: 'abc' })

    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.message).toBe('Password is too weak')
    expect(supabase.auth.reauthenticate).not.toHaveBeenCalled()
  })
})
