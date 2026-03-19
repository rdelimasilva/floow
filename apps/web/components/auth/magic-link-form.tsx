'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { magicLinkSchema, type MagicLinkInput } from '@floow/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function MagicLinkForm() {
  const [sent, setSent] = useState(false)
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

    setSent(true)
  }

  if (sent) {
    return (
      <p className="text-sm text-gray-600 text-center py-2">
        Check your email for the magic link.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="magic-email">Email</Label>
        <Input
          id="magic-email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          {...register('email')}
        />
        {errors.email && (
          <p className="text-xs text-red-500">{errors.email.message}</p>
        )}
      </div>

      {serverError && (
        <p className="text-xs text-red-500">{serverError}</p>
      )}

      <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Sending...' : 'Send magic link'}
      </Button>
    </form>
  )
}
