'use client'

import { createContext, useContext, useState, useCallback } from 'react'

export const SIDEBAR_COOKIE_NAME = 'floow-sidebar-collapsed'

interface SidebarContextValue {
  collapsed: boolean
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggle: () => {},
})

interface SidebarProviderProps {
  children: React.ReactNode
  /**
   * Initial collapsed state, read server-side from a cookie.
   * Passed as a prop to avoid a client-side useEffect that would
   * cause a layout flash and hydration mismatch.
   */
  defaultCollapsed?: boolean
}

export function SidebarProvider({ children, defaultCollapsed = false }: SidebarProviderProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      // Persist to cookie (accessible server-side on next request)
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
      return next
    })
  }, [])

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
