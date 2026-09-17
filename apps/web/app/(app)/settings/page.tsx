import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth/session'
import { PageHeader } from '@/components/ui/page-header'
import { SettingsForm } from './settings-form'

export default async function SettingsPage() {
  const user = await getAuthenticatedUser()

  if (!user) redirect('/auth')

  const meta = user.user_metadata ?? {}

  return (
    <div className="space-y-8">
      <PageHeader
        title="Configurações"
        description="Gerencie seu perfil e preferências da conta"
      />

      <SettingsForm
        email={user.email ?? ''}
        fullName={meta.full_name ?? meta.name ?? ''}
        avatarUrl={meta.avatar_url ?? meta.picture ?? null}
        provider={user.app_metadata?.provider ?? 'email'}
      />
    </div>
  )
}
