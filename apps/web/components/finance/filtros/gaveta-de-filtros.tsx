'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'

interface Props {
  /** Quantos filtros ativos moram dentro da gaveta: nenhum pode ficar invisível. */
  contador: number
  children: ReactNode
}

/**
 * Botão "Filtros" e a gaveta que sobe de baixo, só no celular.
 *
 * Usa o `<dialog>` nativo, como o ConfirmDialog: `showModal` já prende o foco,
 * fecha no Esc e deixa o resto da página inerte. O @radix-ui/react-dialog não
 * está instalado, e a regra é não somar dependência.
 * Os filhos só montam com a gaveta aberta, para o desktop (que mostra os mesmos
 * controles em linha) não ter cópia escondida ouvindo a URL.
 */
export function GavetaDeFiltros({ contador, children }: Props) {
  const [aberta, setAberta] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  const titulo = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (aberta && !el.open) {
      // jsdom não tem showModal; no navegador ele é o caminho.
      if (typeof el.showModal === 'function') el.showModal()
      else el.setAttribute('open', '')
    }
    if (!aberta && el.open) {
      if (typeof el.close === 'function') el.close()
      else el.removeAttribute('open')
    }
  }, [aberta])

  // Passou de 768 px com a gaveta aberta: o dialog some, mas seguiria modal.
  useEffect(() => {
    if (!aberta || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(min-width: 768px)')
    const fechar = () => { if (mq.matches) setAberta(false) }
    mq.addEventListener('change', fechar)
    return () => mq.removeEventListener('change', fechar)
  }, [aberta])

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-haspopup="dialog"
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 md:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filtros
        {contador > 0 && (
          <span className="rounded-full bg-blue-600 px-1.5 text-xs font-semibold tabular-nums text-white">
            {contador}
          </span>
        )}
      </button>

      <dialog
        ref={ref}
        aria-labelledby={titulo}
        onClose={() => setAberta(false)}
        // Toque no fundo escuro: o alvo é o próprio <dialog>, não o conteúdo.
        onClick={(e) => { if (e.target === e.currentTarget) setAberta(false) }}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-2xl border-0 bg-white p-0 shadow-xl backdrop:bg-black/40 md:hidden"
      >
        {aberta && (
          <div className="flex max-h-[85dvh] flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 id={titulo} className="text-base font-semibold text-gray-900">Filtros</h2>
              <button
                type="button"
                aria-label="Fechar filtros"
                onClick={() => setAberta(false)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">{children}</div>
            <div className="border-t border-gray-100 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setAberta(false)}
                className="h-11 w-full rounded-lg bg-gray-900 text-sm font-medium text-white"
              >
                Ver resultados
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}
