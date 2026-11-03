'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ITENS = [
  { href: '/light', label: 'Acompanhamento de gastos' },
  { href: '/light/metas', label: 'Metas' },
]

export function NavDoLight() {
  const atual = usePathname()
  return (
    <nav className="flex gap-1 md:flex-col">
      {ITENS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cn(
            'flex min-h-11 items-center rounded-md px-3 text-sm md:min-h-9',
            atual === i.href ? 'bg-gray-900 font-medium text-white' : 'text-gray-600 hover:bg-gray-100',
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  )
}
