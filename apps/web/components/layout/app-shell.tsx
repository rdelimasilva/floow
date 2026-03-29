'use client'

import { useState, useCallback } from 'react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

interface AppShellProps {
  userEmail: string
  userName: string | null
  avatarUrl: string | null
  cfoBadgeCount?: number
}

export function AppShell({ userEmail, userName, avatarUrl, cfoBadgeCount }: AppShellProps) {
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
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileClose}
      />
    </>
  )
}
