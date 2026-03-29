'use client'

import { useSidebar } from './sidebar-context'
import { cn } from '@/lib/utils'

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()

  return (
    <main
      className={cn(
        'transition-[padding-left] duration-200 ease-in-out',
        // Top padding for topbar (h-14 = 3.5rem)
        'pt-14',
        // Desktop: left padding matches sidebar width
        collapsed ? 'lg:pl-[68px]' : 'lg:pl-56',
      )}
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  )
}
