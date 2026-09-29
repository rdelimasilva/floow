'use client'

import { useEffect } from 'react'

/**
 * Rola até a seção quando o endereço aponta para ela (`#confirmar`).
 *
 * As seções de Conciliar chegam por streaming, cada uma no seu `<Suspense>`.
 * Quando a do `#hash` monta, o navegador já tentou rolar e não achou o
 * elemento. Sem isto, o selo "confirmar?" da linha deixaria o usuário no
 * topo da tela, procurando a seção.
 */
export function RolarParaASecao({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [id])
  return null
}
