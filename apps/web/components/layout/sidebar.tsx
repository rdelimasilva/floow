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
  Building2,
  BarChart3,
  PiggyBank,
  Landmark,
  HelpCircle,
  Bot,
  RefreshCw,
  Pin,
  PinOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from './sidebar-context'

// ---------------------------------------------------------------------------
// Navigation structure
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
      { href: '/transactions/recurring', label: 'Recorrentes', icon: RefreshCw },
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
    title: 'Futuro',
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
  {
    title: 'Suporte',
    items: [
      { href: '/help', label: 'Ajuda', icon: HelpCircle },
    ],
  },
]

// Shared classes for elements that fade in on sidebar hover
const FADE_IN = 'lg:opacity-0 lg:group-hover/sidebar:opacity-100 lg:transition-opacity lg:duration-150 lg:group-hover/sidebar:delay-300'

// ---------------------------------------------------------------------------
// NavLink — icon stays fixed, label fades in via opacity (no layout shift)
// ---------------------------------------------------------------------------

function NavLink({
  item,
  isActive,
  pinned,
  onClick,
  cfoBadgeCount,
}: {
  item: NavItem
  isActive: boolean
  pinned: boolean
  onClick?: () => void
  cfoBadgeCount?: number
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-3 rounded-lg py-2.5 pl-4 pr-3 text-sm font-medium transition-colors',
        isActive
          ? 'bg-gray-100 text-foreground'
          : 'text-muted-foreground hover:bg-gray-50 hover:text-foreground',
      )}
    >
      <item.icon className="h-5 w-5 shrink-0" />

      <span className={cn('whitespace-nowrap', !pinned && FADE_IN)}>
        {item.label}
      </span>

      {item.href === '/cfo' && cfoBadgeCount !== undefined && cfoBadgeCount > 0 && (
        <span className={cn(
          'ml-auto rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 whitespace-nowrap',
          !pinned && FADE_IN,
        )}>
          {cfoBadgeCount}
        </span>
      )}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface SidebarProps {
  cfoBadgeCount?: number
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ cfoBadgeCount, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const { pinned, togglePin } = useSidebar()

  useEffect(() => { onMobileClose() }, [pathname, onMobileClose])

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [mobileOpen])

  function isActive(href: string) {
    if (pathname === href) return true
    if (href === '/transactions') return pathname.startsWith('/transactions/') && !pathname.startsWith('/transactions/recurring')
    return pathname.startsWith(href + '/')
  }

  return (
    <>
      {/* Mobile backdrop */}
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
          'group/sidebar fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-gray-100 bg-white',
          // Clip overflowing labels in collapsed state
          'lg:overflow-hidden',
          // Mobile slide
          'transition-transform duration-200 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: width + shadow transition with delays
          'lg:translate-x-0 lg:transition-[width,box-shadow] lg:duration-200 lg:ease-out',
          pinned
            ? 'lg:w-56'
            : 'lg:w-[68px] lg:delay-75 lg:hover:w-56 lg:hover:delay-200 lg:hover:shadow-[4px_0_16px_rgba(0,0,0,0.08)]',
        )}
      >
        {/* Header */}
        <div className="flex items-center px-4 pt-3">
          {/* Mobile close */}
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="Fechar menu"
            className="rounded p-1 text-muted-foreground hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Desktop pin/unpin */}
          <button
            type="button"
            onClick={togglePin}
            aria-label={pinned ? 'Desafixar menu' : 'Fixar menu aberto'}
            className={cn(
              'ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
              pinned
                ? 'hidden lg:block'
                : 'hidden lg:block',
              !pinned && FADE_IN,
            )}
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
        </div>

        {/* Logo — collapses to 0 height when sidebar is narrow */}
        <div
          className={cn(
            'mx-3 mt-2 mb-1 overflow-hidden',
            !pinned && 'lg:max-h-0 lg:opacity-0 lg:group-hover/sidebar:max-h-40 lg:group-hover/sidebar:opacity-100 lg:transition-[max-height,opacity] lg:duration-200 lg:group-hover/sidebar:delay-200',
          )}
        >
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

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-3 scrollbar-none">
          {NAV_SECTIONS.map((section, idx) => (
            <div key={section.title} className={cn(idx > 0 && 'mt-4')}>
              {/* Section title — fades in */}
              <p className={cn(
                'mb-1.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 whitespace-nowrap',
                !pinned && FADE_IN,
              )}>
                {section.title}
              </p>

              {/* Divider line — visible when collapsed, fades out on hover */}
              {!pinned && idx > 0 && (
                <div className="mx-auto mb-2 mt-1 hidden h-px w-6 bg-border lg:block lg:opacity-100 lg:group-hover/sidebar:opacity-0 lg:transition-opacity lg:duration-100" />
              )}

              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    isActive={isActive(item.href)}
                    pinned={pinned}
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
