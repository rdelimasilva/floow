'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LogOut, Settings, CreditCard, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function UserAvatar({
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

export function UserMenu({
  userName,
  userEmail,
  avatarUrl,
  onSignOut,
}: {
  userName: string | null
  userEmail: string
  avatarUrl: string | null
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const isBillingActive = pathname === '/billing' || pathname.startsWith('/billing/')
  const isSettingsActive = pathname === '/settings' || pathname.startsWith('/settings/')

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const displayName = userName ?? userEmail.split('@')[0]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
      >
        <UserAvatar name={userName} avatarUrl={avatarUrl} size="sm" />
        <span className="hidden text-sm font-medium sm:block">{displayName}</span>
        <ChevronDown
          className={cn(
            'hidden h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 sm:block',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border bg-popover p-1 shadow-lg z-[60] animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-2.5 border-b mb-1">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
          </div>

          <Link
            href="/billing"
            onClick={() => setOpen(false)}
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
            onClick={() => setOpen(false)}
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
    </div>
  )
}
