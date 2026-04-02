'use client'

import { useSidebar } from './sidebar-context'

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { pinned } = useSidebar()

  return (
    <main
      className={`pt-14 lg:transition-[padding-left] lg:duration-150 lg:ease-out ${
        pinned ? 'lg:pl-56' : 'lg:pl-[68px]'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  )
}
