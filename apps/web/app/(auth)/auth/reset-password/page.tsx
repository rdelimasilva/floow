'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Mínimo de 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })

type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export default function ResetPasswordPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  })

  async function onSubmit(data: ResetPasswordInput) {
    setServerError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      password: data.password,
    })

    if (error) {
      setServerError(error.message)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 2000)
  }

  if (success) {
    return (
      <div className="w-full text-center space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Senha redefinida
        </h1>
        <p className="text-sm text-gray-500">
          Sua senha foi atualizada. Redirecionando...
        </p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Redefinir senha
        </h1>
        <p className="text-sm text-gray-500">
          Digite sua nova senha abaixo.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="reset-password">Nova senha</Label>
          <Input
            id="reset-password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register('password')}
          />
          {errors.password && (
            <p className="text-xs text-red-500">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reset-confirm">Confirmar nova senha</Label>
          <Input
            id="reset-confirm"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-red-500">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {serverError && (
          <p className="text-xs text-red-500">{serverError}</p>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando...' : 'Salvar nova senha'}
        </Button>
      </form>

      <Link
        href="/auth"
        className="block w-full text-center text-xs text-gray-500 hover:text-gray-700 underline underline-offset-4"
      >
        Voltar ao login
      </Link>
    </div>
  )
}
