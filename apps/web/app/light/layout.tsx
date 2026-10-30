import { redirect } from 'next/navigation'
import { getShellProfile } from '@/lib/auth/session'
import { ToastProvider } from '@/components/ui/toast'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { NavDoLight } from './nav'

/**
 * floow light: versão enxuta para validar com cliente, só cartão e metas.
 * Fica fora do grupo (app) para não herdar o menu lateral do app completo.
 */
export default async function LightLayout({ children }: { children: React.ReactNode }) {
  const profile = await getShellProfile()
  if (!profile) redirect('/auth?next=/light')

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <span className="text-lg font-semibold text-gray-900">
              floow <span className="font-normal text-gray-500">light</span>
            </span>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="hidden sm:inline">{profile.email}</span>
              <SignOutButton />
            </div>
          </div>
        </header>
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:flex-row">
          <aside className="md:w-56 md:shrink-0">
            <NavDoLight />
          </aside>
          <main className="min-w-0 flex-1 space-y-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  )
}
