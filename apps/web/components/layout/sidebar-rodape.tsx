'use client'

import Link from 'next/link'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { eventosDeDica, someFechado, type DicaHandlers } from './sidebar-item'

/** Fixo na base do menu, fora da área que rola: Ajuda e a versão do app. */
export function SidebarRodape({
  aberto,
  ajudaAtiva,
  onClick,
  dica,
}: {
  aberto: boolean
  ajudaAtiva: boolean
  onClick?: () => void
  dica: DicaHandlers
}) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-t border-gray-100 px-2 pb-[env(safe-area-inset-bottom)]">
      <Link
        href="/help"
        onClick={onClick}
        aria-label="Ajuda"
        aria-current={ajudaAtiva ? 'page' : undefined}
        {...(aberto ? {} : eventosDeDica('Ajuda', dica))}
        className={cn(
          'flex h-9 items-center gap-2 rounded-lg pl-[18px] pr-3 text-sm transition-colors',
          ajudaAtiva
            ? 'bg-primary/[0.08] font-medium text-primary'
            : 'text-muted-foreground hover:bg-gray-100 hover:text-foreground',
        )}
      >
        <HelpCircle className="h-4 w-4 shrink-0" />
        <span className={cn(someFechado(aberto))}>Ajuda</span>
      </Link>
      <span className={cn('ml-auto pr-2 text-[11px] text-gray-400', someFechado(aberto))}>
        v{process.env.NEXT_PUBLIC_APP_VERSION}
      </span>
    </div>
  )
}
