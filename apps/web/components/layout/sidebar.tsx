'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  TrendingUp,
  Tags,
  X,
  Target,
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
  BarChart3,
  PiggyBank,
  Landmark,
  HelpCircle,
  Bot,
  RefreshCw,
} from 'lucide-react'
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
      { href: '/cfo', label: 'Consultor Financeiro', icon: Bot },
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
    title: 'Orçamento',
    items: [
      { href: '/budgets/spending', label: 'Meta de Gastos', icon: PiggyBank },
      { href: '/budgets/investing', label: 'Meta de Investimentos', icon: Target },
    ],
  },
  {
    title: 'Controle Patrimonial',
    items: [
      { href: '/investments', label: 'Investimentos', icon: TrendingUp },
      { href: '/fixed-assets', label: 'Ativos Imobilizados', icon: Building2 },
    ],
  },
  {
    title: 'Dívidas Contratadas',
    items: [
      { href: '/debts', label: 'Controle de Dívidas', icon: Landmark },
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
      { href: '/transactions/recurring', label: 'Recorrentes', icon: RefreshCw },
    ],
  },
  {
    title: 'Suporte',
    items: [
      { href: '/help', label: 'Ajuda', icon: HelpCircle },
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
  cfoBadgeCount,
}: {
  item: NavItem
  isActive: boolean
  collapsed: boolean
  onClick?: () => void
  cfoBadgeCount?: number
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

      {item.href === '/cfo' && cfoBadgeCount !== undefined && cfoBadgeCount > 0 && (
        <span className={cn(
          'ml-auto rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700',
          collapsed && 'lg:hidden',
        )}>
          {cfoBadgeCount}
        </span>
      )}

      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-2 hidden rounded-md bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-md border lg:group-hover:block z-[60] whitespace-nowrap">
          {item.label}
        </span>
      )}
    </Link>
  )
}


// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------

interface SidebarProps {
  cfoBadgeCount?: number
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ cfoBadgeCount, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const { collapsed, toggle } = useSidebar()

  // Auto-close mobile sidebar on route change
  useEffect(() => {
    onMobileClose()
  }, [pathname, onMobileClose])

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [mobileOpen])

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <>
      {/* Mobile backdrop with fade transition */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onMobileClose}
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
        {/* Header: toggle + close */}
        <div className={cn(
          'flex items-center px-4 pt-3',
          collapsed ? 'lg:justify-center' : 'justify-end',
        )}>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors lg:block"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={onMobileClose}
            aria-label="Fechar menu"
            className="rounded p-1 text-muted-foreground hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Logo card — hidden when collapsed */}
        <div className={cn(
          'mx-3 mt-2 mb-1 overflow-hidden transition-all duration-200',
          collapsed && 'lg:hidden',
        )}>
          <Link
            href="/dashboard"
            onClick={onMobileClose}
            className="flex items-center justify-center rounded-xl bg-white border border-gray-100 p-4"
          >
            <Image
              src="https://ak8t3l6j6j.ufs.sh/f/CwfRtcqQB4vVZAAoyfCr1bHQ52TfliXL8pR9wgYu7dBDt3nk"
              alt="Floow"
              width={120}
              height={120}
              className="shrink-0"
              unoptimized
            />
          </Link>
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
                    onClick={onMobileClose}
                    cfoBadgeCount={cfoBadgeCount}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

      </aside>
    </>
  )
}
