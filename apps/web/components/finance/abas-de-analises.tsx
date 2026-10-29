'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ABAS = [
  { href: '/cash-flow', label: 'Fluxo de caixa' },
  { href: '/cash-flow/cartoes', label: 'Cartões' },
]

/** Aba da rota atual; o que não for de outra aba cai no fluxo de caixa. */
function abaDaRota(caminho: string) {
  const especifica = ABAS.slice(1).find((a) => caminho === a.href || caminho.startsWith(`${a.href}/`))
  return (especifica ?? ABAS[0]).href
}

export function AbasDeAnalises() {
  const ativa = abaDaRota(usePathname())

  return (
    <div className="border-b border-gray-200">
      <nav className="flex gap-6 overflow-x-auto" aria-label="Análises">
        {ABAS.map((aba) => {
          const selecionada = aba.href === ativa
          return (
            <Link
              key={aba.href}
              href={aba.href}
              aria-current={selecionada ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap border-b-2 pb-3 text-sm font-medium',
                selecionada
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              )}
            >
              {aba.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
