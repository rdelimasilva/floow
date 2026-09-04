import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/app-shell'
import { SidebarLayout } from '@/components/layout/sidebar-layout'
import { SidebarProvider, SIDEBAR_COOKIE_NAME } from '@/components/layout/sidebar-context'
import { ToastProvider } from '@/components/ui/toast'
import { ReconcileProvider } from '@/components/providers/reconcile-provider'
import { getReviewGateStatus } from '@/lib/openfinance/counterparty-queries'
import { getOrgId } from '@/lib/finance/queries'
import { ReviewGate } from '@/components/openfinance/review-gate'
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

  const orgId = await getOrgId()
  const { blocked } = await getReviewGateStatus(orgId)

  if (blocked) {
    return (
      <ToastProvider>
        <ReviewGate orgId={orgId} />
      </ToastProvider>
    )
  }

  const user = session.user
  const meta = user.user_metadata ?? {}

  const cookieStore = await cookies()
  const sidebarPinned = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === 'true'

  return (
    <ToastProvider>
      <SidebarProvider defaultPinned={sidebarPinned}>
        <ReconcileProvider>
          <div className="min-h-screen bg-gray-50">
            <CommandPalette />
            <AppShell
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
