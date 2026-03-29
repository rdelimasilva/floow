import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { SettingsForm } from './settings-form'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/auth')

  const user = session.user
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
