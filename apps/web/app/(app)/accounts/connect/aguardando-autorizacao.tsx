'use client'

import { useEffect, useRef } from 'react'

/**
 * Enquanto o usuário autoriza na aba do banco, esta tela fica esperando.
 * Quando ele volta (a aba fica visível ou ganha foco), o status da conexão é
 * relido — sem precisar clicar em nada.
 */
export function AvisoDeAutorizacao() {
  return (
    <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status">
      Conclua a autorização na aba do banco. Quando terminar, volte para esta aba.
    </p>
  )
}

/** Voltar para a aba dispara visibilidade E foco; dentro disto é a mesma volta. */
const MESMA_VOLTA_MS = 2_000
// Fora do componente: identidade estável, senão o efeito se reinscreveria a cada render.
const relogio = () => Date.now()

export function useAtualizarAoVoltar(
  ativo: boolean,
  atualizar: () => void,
  agora: () => number = relogio,
) {
  // Sempre a versão mais nova do callback, sem reinscrever os ouvintes.
  const ref = useRef(atualizar)
  useEffect(() => {
    ref.current = atualizar
  }, [atualizar])

  useEffect(() => {
    if (!ativo) return
    let ultima = -Infinity
    const aoVoltar = () => {
      if (document.visibilityState === 'hidden') return
      const t = agora()
      if (t - ultima < MESMA_VOLTA_MS) return
      ultima = t
      ref.current()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('focus', aoVoltar)
    }
  }, [ativo, agora])
}
