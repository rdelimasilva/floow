'use client'

import { createContext, useContext, useCallback, useSyncExternalStore } from 'react'

export const SIDEBAR_COOKIE_NAME = 'floow-sidebar-pinned'

interface SidebarContextValue {
  pinned: boolean
  togglePin: () => void
}

const SidebarContext = createContext<SidebarContextValue>({
  pinned: false,
  togglePin: () => {},
})

// O cookie é a fonte da verdade no cliente. O `defaultPinned` que vem do
// layout pode estar velho: o Next reaproveita payloads do layout gerados antes
// do clique (prefetch, voltar/avançar, bfcache) e, se o estado nascesse dele,
// o menu desfixaria sozinho com o cookie ainda dizendo que está fixado.
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Outra aba pode ter fixado/desfixado enquanto esta estava em segundo plano.
  document.addEventListener('visibilitychange', listener)
  return () => {
    listeners.delete(listener)
    document.removeEventListener('visibilitychange', listener)
  }
}

function readPinnedCookie(): boolean | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${SIDEBAR_COOKIE_NAME}=(true|false)`),
  )
  return match ? match[1] === 'true' : null
}

function writePinnedCookie(pinned: boolean) {
  document.cookie = `${SIDEBAR_COOKIE_NAME}=${pinned}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
  listeners.forEach((listener) => listener())
}

export function SidebarProvider({
  children,
  defaultPinned = false,
}: {
  children: React.ReactNode
  defaultPinned?: boolean
}) {
  const pinned = useSyncExternalStore(
    subscribe,
    () => readPinnedCookie() ?? defaultPinned,
    () => defaultPinned,
  )

  const togglePin = useCallback(() => {
    writePinnedCookie(!(readPinnedCookie() ?? defaultPinned))
  }, [defaultPinned])

  return (
    <SidebarContext.Provider value={{ pinned, togglePin }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
