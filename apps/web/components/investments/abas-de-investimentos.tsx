'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ABAS = [
  { href: '/investments', label: 'Posições' },
  { href: '/investments/dashboard', label: 'Resumo' },
  { href: '/investments/income', label: 'Renda Passiva' },
  { href: '/investments/new', label: 'Novo Ativo / Evento' },
]

/** Aba da rota atual. O detalhe de um ativo (/investments/[id]) cai em Posições. */
function abaDaRota(caminho: string) {
  const especifica = ABAS.slice(1).find((a) => caminho === a.href || caminho.startsWith(`${a.href}/`))
  return (especifica ?? ABAS[0]).href
}

export function AbasDeInvestimentos() {
  const ativa = abaDaRota(usePathname())

  return (
    <div className="border-b border-gray-200">
      <nav className="flex gap-6 overflow-x-auto" aria-label="Investimentos">
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
