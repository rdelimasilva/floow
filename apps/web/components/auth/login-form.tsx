'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { loginSchema, type LoginInput } from '@floow/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginForm() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginInput) {
    setServerError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (error?.code === 'email_not_confirmed') {
      const { error: reenvio } = await supabase.auth.resend({ type: 'signup', email: data.email })
      setServerError(
        reenvio
          ? 'Confirme seu e-mail antes de entrar. Procure o link que enviamos, inclusive no spam.'
          : 'Confirme seu e-mail antes de entrar. Enviamos um link novo para ' + data.email + '.'
      )
      return
    }

    if (error) {
      setServerError(error.message)
      return
    }

    const next = new URLSearchParams(window.location.search).get('next')
    router.replace(next && next.startsWith('/') ? next : '/dashboard')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          aria-describedby={errors.email ? 'login-email-erro' : undefined}
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          error={!!errors.email}
          {...register('email')}
        />
        {errors.email && (
          <p id="login-email-erro" className="text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="login-password">Senha</Label>
        <Input
          id="login-password"
          aria-describedby={errors.password ? 'login-password-erro' : undefined}
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          error={!!errors.password}
          {...register('password')}
        />
        {errors.password && (
          <p id="login-password-erro" className="text-sm text-red-600">{errors.password.message}</p>
        )}
      </div>

      {serverError && (
        <p className="text-sm text-red-600">{serverError}</p>
      )}

      <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Entrando...' : 'Entrar'}
      </Button>
    </form>
  )
}
