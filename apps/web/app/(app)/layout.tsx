import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth/session'
import { AppShell } from '@/components/layout/app-shell'
import { SidebarLayout } from '@/components/layout/sidebar-layout'
import { SidebarProvider, SIDEBAR_COOKIE_NAME } from '@/components/layout/sidebar-context'
import { ToastProvider } from '@/components/ui/toast'
import { getReviewGateStatusSafe } from '@/lib/openfinance/counterparty-queries'
import { ReviewGate } from '@/components/openfinance/review-gate'
import { ApplyDueProvider } from '@/components/providers/apply-due-provider'
import { contagemDeConciliacoesPendentes } from '@/lib/finance/forecast-match-badge'
import dynamic from 'next/dynamic'

const CommandPalette = dynamic(() => import('@/components/layout/command-palette').then(m => ({ default: m.CommandPalette })))
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAuthenticatedUser()

  if (!user) {
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

  // Sem org resolvida (o `gate` já falhou "para aberto"), o menu fica sem
  // número em vez de derrubar o layout — e o mesmo vale se a própria consulta
  // falhar: este arquivo não tem error boundary próprio, então um erro
  // lançado aqui vira tela branca em vez da tela de "tentar de novo" do
  // segmento (mesmo espírito "fail open" do `getReviewGateStatusSafe`, ver o
  // comentário dele).
  let matchBadgeCount: number | undefined
  if (gate.ok) {
    try {
      matchBadgeCount = await contagemDeConciliacoesPendentes(gate.orgId, user.id)
    } catch (error) {
      console.error('[match-badge] falha ao contar propostas pendentes, seguindo sem numero:', error)
    }
  }

  const meta = user.user_metadata ?? {}

  const cookieStore = await cookies()
  const sidebarPinned = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === 'true'

  return (
    <ToastProvider>
      <SidebarProvider defaultPinned={sidebarPinned}>
        <ApplyDueProvider>
          <div className="min-h-screen bg-gray-50">
            <CommandPalette />
            <AppShell
              userEmail={user.email ?? ''}
              userName={meta.full_name ?? meta.name ?? null}
              avatarUrl={meta.avatar_url ?? meta.picture ?? null}
              matchBadgeCount={matchBadgeCount}
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
