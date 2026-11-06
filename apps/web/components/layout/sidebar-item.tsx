'use client'

import Link from 'next/link'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NavItem } from './nav-config'

/** Some no desktop enquanto o menu está compacto; no celular a gaveta é sempre larga. */
export function someFechado(aberto: boolean) {
  return !aberto && 'lg:hidden'
}

export interface DicaHandlers {
  mostrar: (texto: string, el: HTMLElement) => void
  esconder: () => void
}

export function eventosDeDica(texto: string, dica: DicaHandlers) {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => dica.mostrar(texto, e.currentTarget),
    onMouseLeave: dica.esconder,
    onFocus: (e: React.FocusEvent<HTMLElement>) => dica.mostrar(texto, e.currentTarget),
    onBlur: dica.esconder,
  }
}

export function SidebarItem({
  item,
  href,
  isActive,
  aberto,
  favorito,
  onFavoritar,
  estrelaVisivel,
  onClick,
  badge,
  dica,
}: {
  item: NavItem
  href: string
  isActive: boolean
  aberto: boolean
  favorito: boolean
  onFavoritar: () => void
  /** Força a estrela visível (dica de descoberta dos favoritos). */
  estrelaVisivel?: boolean
  onClick?: () => void
  badge?: number
  dica: DicaHandlers
}) {
  return (
    <div className="group/item relative">
      <Link
        href={href}
        // Busca a tela inteira assim que o menu aparece: o primeiro clique em cada
        // item abre do cache (era 340–470 ms de skeleton), não só o segundo.
        prefetch={true}
        onClick={onClick}
        aria-current={isActive ? 'page' : undefined}
        aria-label={item.label}
        {...(aberto ? {} : eventosDeDica(item.label, dica))}
        className={cn(
          'relative flex h-9 items-center gap-3 rounded-lg pl-4 pr-9 text-sm transition-colors',
          isActive
            ? 'bg-primary/[0.08] font-medium text-primary'
            : 'text-muted-foreground hover:bg-gray-100 hover:text-foreground',
        )}
      >
        {isActive && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-sm bg-primary" />}
        <item.icon className="h-5 w-5 shrink-0" />
        <span className={cn('truncate whitespace-nowrap', someFechado(aberto))}>{item.label}</span>
        {badge !== undefined && badge > 0 && (
          <span className={cn(
            'ml-auto rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 whitespace-nowrap',
            someFechado(aberto),
          )}>
            {badge}
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={onFavoritar}
        aria-pressed={favorito}
        aria-label={favorito ? `Tirar ${item.label} dos favoritos` : `Adicionar ${item.label} aos favoritos`}
        className={cn(
          'absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 transition-opacity hover:opacity-100 focus-visible:opacity-100',
          favorito || estrelaVisivel
            ? 'text-primary opacity-100'
            : 'text-muted-foreground opacity-0 group-hover/item:opacity-40',
          someFechado(aberto),
        )}
      >
        <Star className={cn('h-3.5 w-3.5', favorito && 'fill-current')} />
      </button>
    </div>
  )
}
