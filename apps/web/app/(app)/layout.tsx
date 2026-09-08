import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/app-shell'
import { SidebarLayout } from '@/components/layout/sidebar-layout'
import { SidebarProvider, SIDEBAR_COOKIE_NAME } from '@/components/layout/sidebar-context'
import { ToastProvider } from '@/components/ui/toast'
import { ReconcileProvider } from '@/components/providers/reconcile-provider'
import { getReviewGateStatusSafe, getPendingCounterpartyCount } from '@/lib/openfinance/counterparty-queries'
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

  const gate = await getReviewGateStatusSafe()

  if (gate.ok && gate.blocked) {
    return (
      <ToastProvider>
        <ReviewGate orgId={gate.orgId} />
      </ToastProvider>
    )
  }

  const user = session.user
  const meta = user.user_metadata ?? {}

  const cookieStore = await cookies()
  const sidebarPinned = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === 'true'

  // Mesmo racional de `getReviewGateStatusSafe`: o layout não tem error
  // boundary próprio, então uma falha aqui vazaria para o `global-error.tsx`.
  // Badge é enfeite — sem contagem, sem badge, e a navegação continua.
  const pendingCount = gate.ok
    ? await getPendingCounterpartyCount(gate.orgId).catch(() => 0)
    : 0

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
              badges={{ '/transactions/review': pendingCount }}
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
