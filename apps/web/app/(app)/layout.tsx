import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { SidebarLayout } from '@/components/layout/sidebar-layout'
import { SidebarProvider } from '@/components/layout/sidebar-context'
import { ToastProvider } from '@/components/providers/toast-provider'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/auth')
  }

  const user = session.user
  const meta = user.user_metadata ?? {}

  return (
    <ToastProvider>
      <SidebarProvider>
        <div className="min-h-screen bg-gray-50">
          <Sidebar
            userEmail={user.email ?? ''}
            userName={meta.full_name ?? meta.name ?? null}
            avatarUrl={meta.avatar_url ?? meta.picture ?? null}
          />
          <SidebarLayout>
            {children}
          </SidebarLayout>
        </div>
      </SidebarProvider>
    </ToastProvider>
  )
}
