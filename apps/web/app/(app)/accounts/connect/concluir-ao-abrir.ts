'use client'

import { useEffect, useRef } from 'react'

/**
 * Pop-up bloqueado: a autorização abre NA MESMA aba e o wizard perde o
 * estado. Quando o usuário volta para a tela, as conexões guiadas ainda
 * pendentes são concluídas aqui, sem clique — uma vez por abertura da tela.
 *
 * Só as pendentes no primeiro render: conexão que surge depois foi criada pelo
 * wizard desta mesma tela, e quem a acompanha é ele. O servidor garante que o
 * vínculo roda uma vez só (`auto_link_done_at`), então repetir seria inócuo —
 * só não é necessário.
 */
export function useConcluirAoAbrir(pendentes: string[], concluir: (id: string) => void) {
  const iniciais = useRef(pendentes)
  const feito = useRef(false)
  const ref = useRef(concluir)
  useEffect(() => {
    ref.current = concluir
  }, [concluir])

  useEffect(() => {
    if (feito.current) return
    feito.current = true
    for (const id of iniciais.current) ref.current(id)
  }, [])
}
