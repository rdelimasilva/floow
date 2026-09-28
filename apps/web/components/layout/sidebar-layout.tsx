'use client'

import { useSidebar } from './sidebar-context'

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { pinned } = useSidebar()

  return (
    <main
      className={`pt-[calc(3.5rem+env(safe-area-inset-top))] lg:transition-[padding-left] lg:duration-150 lg:ease-out ${
        pinned ? 'lg:pl-56' : 'lg:pl-[68px]'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  )
}
