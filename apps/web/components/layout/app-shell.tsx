'use client'

import { useState, useCallback } from 'react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

interface AppShellProps {
  userEmail: string
  userName: string | null
  avatarUrl: string | null
  badges?: Record<string, number>
}

export function AppShell({ userEmail, userName, avatarUrl, badges }: AppShellProps) {
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
        badges={badges}
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileClose}
      />
    </>
  )
}
