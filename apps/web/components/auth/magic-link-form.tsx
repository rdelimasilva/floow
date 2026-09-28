'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { magicLinkSchema, type MagicLinkInput } from '@floow/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// O e-mail leva o link e o código. O código existe por causa do app instalado
// no iPhone: o link abre no Safari, que não divide a sessão com o PWA, e o
// usuário ficaria logado no lugar errado. Digitando o código, a sessão nasce
// onde ele está.
export function MagicLinkForm() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MagicLinkInput>({
    resolver: zodResolver(magicLinkSchema),
  })

  async function onSubmit(data: MagicLinkInput) {
    setServerError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: data.email,
      options: {
        emailRedirectTo: window.location.origin + '/auth/callback',
      },
    })

    if (error) {
      setServerError(error.message)
      return
    }

    setEmail(data.email)
  }

  async function entrarComCodigo(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setServerError(null)
    setVerificando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo.trim(), type: 'email' })
    setVerificando(false)

    if (error) {
      setServerError('Código inválido ou expirado. Confira o e-mail mais recente ou peça outro.')
      return
    }

    const next = new URLSearchParams(window.location.search).get('next')
    router.replace(next && next.startsWith('/') ? next : '/dashboard')
  }

  if (email) {
    return (
      <form onSubmit={entrarComCodigo} className="space-y-4">
        <p className="text-sm text-gray-600">
          Enviamos um código para <strong>{email}</strong>. Digite abaixo ou toque no link do e-mail.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="magic-code">Código</Label>
          <Input
            id="magic-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="123456"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
          />
        </div>

        {serverError && (
          <p className="text-xs text-red-500">{serverError}</p>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={verificando || codigo.length < 6}>
          {verificando ? 'Entrando...' : 'Entrar'}
        </Button>
        <button
          type="button"
          onClick={() => { setEmail(null); setCodigo(''); setServerError(null) }}
          className="w-full text-center text-xs text-gray-500 hover:text-gray-700"
        >
          Usar outro e-mail ou reenviar
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="magic-email">Email</Label>
        <Input
          id="magic-email"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          {...register('email')}
        />
        {errors.email && (
          <p className="text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      {serverError && (
        <p className="text-xs text-red-500">{serverError}</p>
      )}

      <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Enviando...' : 'Enviar código de acesso'}
      </Button>
    </form>
  )
}
