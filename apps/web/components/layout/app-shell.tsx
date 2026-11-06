'use client'

import { useState, useCallback } from 'react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

interface AppShellProps {
  userEmail: string
  userName: string | null
  avatarUrl: string | null
  cfoBadgeCount?: number
  favoritos: string[]
}

export function AppShell({ userEmail, userName, avatarUrl, cfoBadgeCount, favoritos }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const handleMobileClose = useCallback(() => setMobileOpen(false), [])

  return (
    <>
      <Topbar
        userEmail={userEmail}
        userName={userName}
        avatarUrl={avatarUrl}
        onMobileMenuOpen={() => setMobileOpen(true)}
      />
      <Sidebar
        cfoBadgeCount={cfoBadgeCount}
        favoritosIniciais={favoritos}
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileClose}
      />
    </>
  )
}
