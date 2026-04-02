'use client'

import { createContext, useContext, useState, useCallback } from 'react'

export const SIDEBAR_COOKIE_NAME = 'floow-sidebar-pinned'

interface SidebarContextValue {
  pinned: boolean
  togglePin: () => void
}

const SidebarContext = createContext<SidebarContextValue>({
  pinned: false,
  togglePin: () => {},
})

export function SidebarProvider({
  children,
  defaultPinned = false,
}: {
  children: React.ReactNode
  defaultPinned?: boolean
}) {
  const [pinned, setPinned] = useState(defaultPinned)

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
      return next
    })
  }, [])

  return (
    <SidebarContext.Provider value={{ pinned, togglePin }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
