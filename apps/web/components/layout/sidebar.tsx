'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  TrendingUp,
  CreditCard,
  Tags,
  LogOut,
  Menu,
  X,
  Target,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/accounts', label: 'Contas', icon: Wallet },
  { href: '/transactions', label: 'Transações', icon: ArrowLeftRight },
  { href: '/investments', label: 'Investimentos', icon: TrendingUp },
  { href: '/categories', label: 'Categorias', icon: Tags },
  { href: '/planning', label: 'Planejamento', icon: Target },
  { href: '/billing', label: 'Plano', icon: CreditCard },
]

interface SidebarProps {
  userEmail: string
}

export function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth')
    router.refresh()
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-40 rounded-lg bg-white p-2 shadow-md lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-gray-200 bg-white transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo + mobile close */}
        <div className="flex h-14 items-center justify-between px-5 border-b border-gray-200">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-gray-900">
            Floow
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-gray-400 hover:text-gray-700 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-gray-200 px-3 py-3">
          <p className="truncate px-3 text-xs text-gray-500">{userEmail}</p>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sair
          </button>
        </div>
      </aside>
    </>
  )
}
