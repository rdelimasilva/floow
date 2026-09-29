import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getShellProfile } from '@/lib/auth/session'
import { AppShell } from '@/components/layout/app-shell'
import { SidebarLayout } from '@/components/layout/sidebar-layout'
import { SidebarProvider, SIDEBAR_COOKIE_NAME } from '@/components/layout/sidebar-context'
import { ToastProvider } from '@/components/ui/toast'
import { ApplyDueProvider } from '@/components/providers/apply-due-provider'
import dynamic from 'next/dynamic'

const CommandPalette = dynamic(() => import('@/components/layout/command-palette').then(m => ({ default: m.CommandPalette })))
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Nenhuma ida ao servidor de Auth: o perfil vem do token já verificado. Este
  // layout roda em toda navegação, antes até do skeleton, e cada ida à rede
  // aqui é espera em todas as telas.
  //
  // O portão de Classificar saiu (spec 2026-09-29): nenhuma decisão tranca o
  // app. As filas se anunciam na tela de Transações (`PendingQueuesNotice`),
  // e o layout volta a não consultar nada além do perfil.
  const profile = await getShellProfile()

  if (!profile) {
    redirect('/auth')
  }

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
