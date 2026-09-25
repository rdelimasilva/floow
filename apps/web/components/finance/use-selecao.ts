'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * Seleção da lista de transações. Shift+clique marca (ou desmarca) o intervalo
 * entre o último item clicado e o atual, na ordem em que aparecem. A seleção
 * pode ir além da página — "selecionar todas do filtro" — e `paginaToda` diz
 * se os itens desta página estão todos marcados.
 */
export function useSelecao(idsDaPagina: string[]) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const ultimo = useRef<string | null>(null)
  const ids = useRef(idsDaPagina)
  ids.current = idsDaPagina

  const alternar = useCallback((id: string, comShift: boolean) => {
    // Lido agora: o updater do estado roda depois, com `ultimo` já trocado.
    const de = ultimo.current ? ids.current.indexOf(ultimo.current) : -1
    const ate = ids.current.indexOf(id)
    const pagina = ids.current
    setSelecionados((prev) => {
      const next = new Set(prev)
      const marcar = !prev.has(id)
      if (comShift && de >= 0 && ate >= 0) {
        const [i, j] = de < ate ? [de, ate] : [ate, de]
        for (const x of pagina.slice(i, j + 1)) {
          if (marcar) next.add(x)
          else next.delete(x)
        }
      } else if (marcar) next.add(id)
      else next.delete(id)
      return next
    })
    ultimo.current = id
  }, [])

  const definir = useCallback((lista: string[]) => setSelecionados(new Set(lista)), [])
  const limpar = useCallback(() => setSelecionados(new Set()), [])

  const paginaToda = idsDaPagina.length > 0 && idsDaPagina.every((id) => selecionados.has(id))

  return { selecionados, alternar, definir, limpar, paginaToda }
}
