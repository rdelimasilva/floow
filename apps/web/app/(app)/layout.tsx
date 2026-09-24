import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getShellProfile } from '@/lib/auth/session'
import { AppShell } from '@/components/layout/app-shell'
import { SidebarLayout } from '@/components/layout/sidebar-layout'
import { SidebarProvider, SIDEBAR_COOKIE_NAME } from '@/components/layout/sidebar-context'
import { ToastProvider } from '@/components/ui/toast'
import { getReviewGateStatusSafe } from '@/lib/openfinance/counterparty-queries'
import { ReviewGate } from '@/components/openfinance/review-gate'
import { ApplyDueProvider } from '@/components/providers/apply-due-provider'
import dynamic from 'next/dynamic'

const CommandPalette = dynamic(() => import('@/components/layout/command-palette').then(m => ({ default: m.CommandPalette })))
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // As duas leituras saem juntas e nenhuma vai ao servidor de Auth: o perfil
  // vem do token já verificado. Este layout roda em toda navegação, antes até
  // do skeleton — cada ida à rede aqui é espera em todas as telas.
  const [profile, gate] = await Promise.all([getShellProfile(), getReviewGateStatusSafe()])

  if (!profile) {
    redirect('/auth')
  }

  if (gate.ok && gate.blocked) {
    return (
      <ToastProvider>
        <ReviewGate orgId={gate.orgId} />
      </ToastProvider>
    )
  }

  // O contador de conciliações saiu daqui junto com o item do menu: as filas
  // agora se anunciam no topo da lista de lançamentos (`PendingQueuesNotice`),
  // que é onde o assunto aparece. O layout volta a não consultar nada para
  // montar o menu.
  const cookieStore = await cookies()
  const sidebarPinned = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === 'true'

  return (
    <ToastProvider>
      <SidebarProvider defaultPinned={sidebarPinned}>
        <ApplyDueProvider>
          <div className="min-h-screen bg-gray-50">
            <CommandPalette />
            <AppShell
              userEmail={profile.email}
              userName={profile.name}
              avatarUrl={profile.avatarUrl}
            />
            <SidebarLayout>
              {children}
            </SidebarLayout>
          </div>
        </ApplyDueProvider>
      </SidebarProvider>
    </ToastProvider>
  )
}
