'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import { changePassword } from '@/lib/auth/change-password'
import { User, Mail, KeyRound, Loader2 } from 'lucide-react'

interface SettingsFormProps {
  email: string
  fullName: string
  avatarUrl: string | null
  provider: string
}

export function SettingsForm({ email, fullName, avatarUrl, provider }: SettingsFormProps) {
  const [name, setName] = useState(fullName)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // Preenchidos só quando o Supabase exige reautenticação (sessão com mais de
  // 24h). Sessão recente troca a senha sem ver este passo.
  const [nonceRequired, setNonceRequired] = useState(false)
  const [nonce, setNonce] = useState('')
  const { toast } = useToast()
  const router = useRouter()
  const isOAuth = provider !== 'email'

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        data: { full_name: name.trim() },
      })
      if (error) throw error
      toast('Perfil atualizado com sucesso')
      router.refresh()
    } catch (err: any) {
      toast(err.message || 'Erro ao atualizar perfil', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 6) {
      toast('A senha deve ter pelo menos 6 caracteres', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      toast('As senhas não coincidem', 'error')
      return
    }

    if (nonceRequired && !nonce.trim()) {
      toast('Informe o código enviado para o seu e-mail', 'error')
      return
    }

    setChangingPassword(true)
    try {
      const result = await changePassword(createClient(), {
        password: newPassword,
        nonce: nonceRequired ? nonce.trim() : undefined,
      })

      if (result.status === 'nonce_required') {
        setNonceRequired(true)
        toast('Enviamos um código para o seu e-mail. Informe-o para confirmar a troca.')
        return
      }

      if (result.status === 'error') {
        toast(result.message, 'error')
        return
      }

      toast('Senha alterada com sucesso')
      setNewPassword('')
      setConfirmPassword('')
      setNonce('')
      setNonceRequired(false)
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Profile Section */}
      <section className="rounded-lg border bg-white p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold mb-4">
          <User className="h-4 w-4" />
          Perfil
        </h2>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Avatar"
                width={64}
                height={64}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                {(name || email)[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div className="text-sm text-muted-foreground">
              {isOAuth
                ? `Foto gerenciada pelo ${provider === 'google' ? 'Google' : provider}`
                : 'Foto de perfil'}
            </div>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1.5">
              Nome completo
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5">
              <Mail className="inline h-3.5 w-3.5 mr-1" />
              Email
            </label>
            <Input id="email" value={email} disabled className="bg-gray-50" />
            <p className="mt-1 text-xs text-muted-foreground">
              O email não pode ser alterado
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving || name.trim() === fullName}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </div>
        </form>
      </section>

      {/* Password Section — only for email auth */}
      {!isOAuth && (
        <section className="rounded-lg border bg-white p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold mb-4">
            <KeyRound className="h-4 w-4" />
            Alterar Senha
          </h2>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium mb-1.5">
                Nova senha
              </label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium mb-1.5">
                Confirmar nova senha
              </label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
              />
            </div>

            {nonceRequired && (
              <div>
                <label htmlFor="reauth-nonce" className="block text-sm font-medium mb-1.5">
                  Código de confirmação
                </label>
                <Input
                  id="reauth-nonce"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={nonce}
                  onChange={(e) => setNonce(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                />
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Por segurança, enviamos um código para <strong>{email}</strong>. Informe-o
                  para confirmar a troca de senha.
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="outline"
                disabled={
                  changingPassword ||
                  !newPassword ||
                  !confirmPassword ||
                  (nonceRequired && !nonce.trim())
                }
              >
                {changingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {nonceRequired ? 'Confirmar e alterar' : 'Alterar Senha'}
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Account Info */}
      <section className="rounded-lg border bg-white p-6">
        <h2 className="text-base font-semibold mb-3">Conta</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Provedor de login</span>
            <span className="font-medium capitalize">{provider === 'email' ? 'Email/Senha' : provider}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Versão do app</span>
            <span className="font-medium">v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
          </div>
        </div>
      </section>
    </div>
  )
}
