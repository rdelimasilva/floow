'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  TrendingUp,
  Tags,
  LogOut,
  Menu,
  X,
  Target,
  CreditCard,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronUp,
  Settings,
  Building2,
  BarChart3,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useSidebar } from './sidebar-context'

// ---------------------------------------------------------------------------
// Navigation structure grouped by section
// ---------------------------------------------------------------------------

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavSection {
  title: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Dia a dia',
    items: [
      { href: '/cash-flow', label: 'Fluxo de Caixa', icon: BarChart3 },
      { href: '/transactions', label: 'Transações', icon: ArrowLeftRight },
    ],
  },
  {
    title: 'Investimentos',
    items: [
      { href: '/investments', label: 'Investimentos', icon: TrendingUp },
    ],
  },
  {
    title: 'Ativos Imobilizados',
    items: [
      { href: '/fixed-assets', label: 'Ativos Imobilizados', icon: Building2 },
    ],
  },
  {
    title: 'Planejamento',
    items: [
      { href: '/planning', label: 'Planejamento', icon: Target },
    ],
  },
  {
    title: 'Cadastros',
    items: [
      { href: '/accounts', label: 'Contas', icon: Wallet },
      { href: '/categories', label: 'Categorias', icon: Tags },
    ],
  },
]

// ---------------------------------------------------------------------------
// Nav link with tooltip when collapsed (desktop only)
// ---------------------------------------------------------------------------

function NavLink({
  item,
  isActive,
  collapsed,
  onClick,
}: {
  item: NavItem
  isActive: boolean
  collapsed: boolean
  onClick?: () => void
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group relative flex items-center rounded-lg text-sm font-medium transition-colors',
        // Mobile: always full row. Desktop collapsed: centered icon only
        collapsed ? 'gap-3 px-3 py-2.5 lg:justify-center lg:px-2' : 'gap-3 px-3 py-2.5',
        isActive
          ? 'bg-gray-100 text-foreground'
          : 'text-muted-foreground hover:bg-gray-50 hover:text-foreground',
      )}
    >
      <item.icon className={cn('shrink-0', collapsed ? 'h-4 w-4 lg:h-5 lg:w-5' : 'h-4 w-4')} />
      <span className={cn(collapsed && 'lg:hidden')}>{item.label}</span>

      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-2 hidden rounded-md bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-md border lg:group-hover:block z-[60] whitespace-nowrap">
          {item.label}
        </span>
      )}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Avatar with initials fallback
// ---------------------------------------------------------------------------

function UserAvatar({
  name,
  avatarUrl,
  size = 'md',
}: {
  name: string | null
  avatarUrl: string | null
  size?: 'sm' | 'md'
}) {
  const initials = (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const dims = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm'

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name ?? 'Avatar'}
        width={size === 'sm' ? 32 : 36}
        height={size === 'sm' ? 32 : 36}
        className={cn('shrink-0 rounded-full object-cover', dims)}
      />
    )
  }

  return (
    <div
      className={cn(
        'shrink-0 flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary',
        dims,
      )}
    >
      {initials}
    </div>
  )
}

// ---------------------------------------------------------------------------
// User menu dropdown
// ---------------------------------------------------------------------------

function UserMenu({
  userName,
  userEmail,
  avatarUrl,
  collapsed,
  onSignOut,
  onNavigate,
}: {
  userName: string | null
  userEmail: string
  avatarUrl: string | null
  collapsed: boolean
  onSignOut: () => void
  onNavigate: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const isBillingActive = pathname === '/billing' || pathname.startsWith('/billing/')
  const isSettingsActive = pathname === '/settings' || pathname.startsWith('/settings/')

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  // Close on route change
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  function handleLinkClick() {
    setOpen(false)
    onNavigate()
  }

  const displayName = userName ?? userEmail.split('@')[0]

  return (
    <div ref={ref} className="relative">
      {/* Dropdown popover — positioned above the trigger */}
      {open && (
        <div
          className={cn(
            'absolute bottom-full mb-2 rounded-lg border bg-popover p-1 shadow-lg z-[60] animate-in fade-in slide-in-from-bottom-2 duration-150',
            collapsed ? 'left-0 w-48' : 'left-0 right-0',
          )}
        >
          <div className="px-3 py-2.5 border-b mb-1">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
          </div>

          <Link
            href="/billing"
            onClick={handleLinkClick}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              isBillingActive
                ? 'bg-gray-100 text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <CreditCard className="h-4 w-4" />
            Plano
          </Link>

          <Link
            href="/settings"
            onClick={handleLinkClick}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              isSettingsActive
                ? 'bg-gray-100 text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Settings className="h-4 w-4" />
            Configurações
          </Link>

          <div className="border-t mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onSignOut()
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex w-full items-center rounded-lg transition-colors hover:bg-accent',
          collapsed ? 'gap-3 px-3 py-2.5 lg:justify-center lg:p-2' : 'gap-3 px-3 py-2.5',
        )}
      >
        <UserAvatar name={userName} avatarUrl={avatarUrl} size={collapsed ? 'sm' : 'md'} />

        <div className={cn('flex-1 min-w-0 text-left', collapsed && 'lg:hidden')}>
          <p className="text-sm font-medium truncate">{displayName}</p>
        </div>
        <ChevronUp
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            collapsed && 'lg:hidden',
            open && 'rotate-180',
          )}
        />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------

interface SidebarProps {
  userEmail: string
  userName: string | null
  avatarUrl: string | null
}

export function Sidebar({ userEmail, userName, avatarUrl }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { collapsed, toggle } = useSidebar()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Auto-close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [mobileOpen])

  const handleSignOut = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth')
    router.refresh()
  }, [router])

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  function closeMobile() {
    setMobileOpen(false)
  }

  return (
    <>
      {/* Mobile hamburger — safe area aware */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
        className="fixed top-4 left-4 z-40 rounded-lg bg-white p-2 shadow-md active:scale-95 transition-transform lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile backdrop with fade transition */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={closeMobile}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-gray-100 bg-white transition-all duration-200 ease-in-out',
          'lg:translate-x-0',
          collapsed && 'lg:w-[68px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Header: logo + toggle */}
        <div className="flex h-14 items-center justify-between px-4">
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className={cn(
              'text-lg font-semibold tracking-tight',
              collapsed && 'lg:hidden',
            )}
          >
            Floow
          </Link>

          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className={cn(
              'hidden rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors lg:block',
              collapsed && 'lg:mx-auto',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={closeMobile}
            aria-label="Fechar menu"
            className="rounded p-1 text-muted-foreground hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation sections */}
        <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-3">
          {NAV_SECTIONS.map((section, idx) => (
            <div key={section.title} className={cn(idx > 0 && 'mt-4')}>
              <p className={cn(
                'mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60',
                collapsed && 'lg:hidden',
              )}>
                {section.title}
              </p>
              {collapsed && idx > 0 && (
                <div className="mx-auto mb-2 mt-1 hidden h-px w-6 bg-border lg:block" />
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    isActive={isActive(item.href)}
                    collapsed={collapsed}
                    onClick={closeMobile}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-2 py-3">
          <UserMenu
            userName={userName}
            userEmail={userEmail}
            avatarUrl={avatarUrl}
            collapsed={collapsed}
            onSignOut={handleSignOut}
            onNavigate={closeMobile}
          />
        </div>
      </aside>
    </>
  )
}
