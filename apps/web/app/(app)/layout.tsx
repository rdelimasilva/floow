import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  // Use getSession() (reads cookie locally, no network call) instead of getUser()
  // (which hits Supabase auth server). Middleware already validated the JWT.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/auth')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar userEmail={session.user.email ?? ''} />
      <main className="pl-56">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
