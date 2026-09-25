'use client'

import { Search } from 'lucide-react'
import { abrirPaleta } from '@/lib/paleta'

/**
 * Porta visível para a paleta de comandos. No celular vira só o ícone; o
 * atalho aparece onde há teclado.
 */
export function BotaoDeBusca() {
  return (
    <button
      type="button"
      onClick={abrirPaleta}
      aria-label="Buscar página ou ação"
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 sm:w-64"
    >
      <Search className="h-4 w-4" aria-hidden />
      <span className="hidden flex-1 text-left sm:inline">Buscar...</span>
      <kbd className="hidden rounded border bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500 sm:inline">Ctrl K</kbd>
    </button>
  )
}
