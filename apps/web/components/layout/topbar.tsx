'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Menu } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSidebar } from './sidebar-context'
import { UserMenu } from './user-menu'
import { cn } from '@/lib/utils'

interface TopbarProps {
  userEmail: string
  userName: string | null
  avatarUrl: string | null
  onMobileMenuOpen: () => void
}

export function Topbar({ userEmail, userName, avatarUrl, onMobileMenuOpen }: TopbarProps) {
  const { collapsed } = useSidebar()
  const router = useRouter()

  const handleSignOut = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/auth')
  }, [router])

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-30 flex h-14 items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-sm px-4 transition-[left] duration-200 ease-in-out',
        'left-0 lg:left-56',
        collapsed && 'lg:left-[68px]',
      )}
    >
      {/* Left: mobile hamburger */}
      <button
        type="button"
        onClick={onMobileMenuOpen}
        aria-label="Abrir menu"
        className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Left spacer on desktop */}
      <div className="hidden lg:block" />

      {/* Right: version + user */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-muted-foreground/50">
          v{process.env.NEXT_PUBLIC_APP_VERSION}
        </span>
        <UserMenu
          userName={userName}
          userEmail={userEmail}
          avatarUrl={avatarUrl}
          onSignOut={handleSignOut}
        />
      </div>
    </header>
  )
}
