import { useEffect, useRef } from 'react'

// Com foco num destes, Enter e números são do próprio campo, não da fila (spec §2.5).
const CAMPOS = 'button, input, select, textarea, [role="combobox"], [contenteditable="true"]'

/**
 * Teclas soltas no documento, fora de campos e sem modificador. O listener
 * é registrado uma vez e lê a versão mais recente de `tratar` por ref, para
 * ver sempre o card da frente.
 */
export function useAtalhos(tratar: (e: KeyboardEvent) => void) {
  const atual = useRef(tratar)
  atual.current = tratar
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target instanceof Element && e.target.closest(CAMPOS)) return
      atual.current(e)
    }
    document.addEventListener('keydown', ouvir)
    return () => document.removeEventListener('keydown', ouvir)
  }, [])
}
