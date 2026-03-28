import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { SidebarLayout } from '@/components/layout/sidebar-layout'
import { SidebarProvider, SIDEBAR_COOKIE_NAME } from '@/components/layout/sidebar-context'
import { ToastProvider } from '@/components/providers/toast-provider'
import { ReconcileProvider } from '@/components/providers/reconcile-provider'
import dynamic from 'next/dynamic'

const CommandPalette = dynamic(() => import('@/components/layout/command-palette').then(m => ({ default: m.CommandPalette })))
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

  // Read sidebar collapsed state from cookie server-side to avoid client-side
  // layout flash (prevents hydration mismatch and re-render on mount).
  const cookieStore = await cookies()
  const sidebarCollapsed = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === 'true'

  return (
    <ToastProvider>
      <SidebarProvider defaultCollapsed={sidebarCollapsed}>
        <ReconcileProvider>
          <div className="min-h-screen bg-gray-50">
            <CommandPalette />
            <Sidebar
              userEmail={user.email ?? ''}
              userName={meta.full_name ?? meta.name ?? null}
              avatarUrl={meta.avatar_url ?? meta.picture ?? null}
            />
            <SidebarLayout>
              {children}
            </SidebarLayout>
          </div>
        </ReconcileProvider>
      </SidebarProvider>
    </ToastProvider>
  )
}
