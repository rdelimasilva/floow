'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DURACAO_COM_ACAO_MS } from '@/components/ui/toast'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

interface Alvo {
  id: string
  transferGroupId?: string | null
  balanceApplied?: boolean | null
}

type Toast = (
  mensagem: string,
  tipo?: 'success' | 'error' | 'info',
  opcoes?: { acao?: { rotulo: string; onClick: () => void } },
) => void

interface Opcoes {
  excluir: (id: string) => Promise<unknown>
  toast: Toast
}

function avisoDeRemocao(alvo: Alvo) {
  if (alvo.transferGroupId) return 'Transferência removida'
  if (alvo.balanceApplied === false) return 'Previsão removida'
  return 'Lançamento removido'
}

/**
 * Exclusão com "Desfazer" no lugar da confirmação.
 *
 * A linha some na hora e a exclusão só vai ao banco quando o aviso expira —
 * nada é gravado enquanto dá para desfazer, então o banco não precisa de
 * lixeira. Transferência some pelas duas pernas, que é o que a exclusão apaga.
 * Sair da tela antes do prazo não cancela: o pedido foi excluir.
 */
export function useExclusaoComDesfazer({ excluir, toast }: Opcoes) {
  const [ocultos, setOcultos] = useState<Set<string>>(new Set())
  const pendentes = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; id: string }>())
  const excluirRef = useRef(excluir)
  excluirRef.current = excluir

  const chave = (alvo: Alvo) => alvo.transferGroupId ?? alvo.id

  const mostrar = useCallback((k: string) => {
    setOcultos((prev) => {
      const next = new Set(prev)
      next.delete(k)
      return next
    })
  }, [])

  const pedir = useCallback(
    (alvo: Alvo) => {
      const k = chave(alvo)
      setOcultos((prev) => new Set(prev).add(k))

      const timer = setTimeout(async () => {
        pendentes.current.delete(k)
        try {
          await excluirRef.current(alvo.id)
        } catch (e) {
          mostrar(k)
          toast(mensagemDeErro(e, 'Não foi possível remover a transação.'), 'error')
        }
      }, DURACAO_COM_ACAO_MS)
      pendentes.current.set(k, { timer, id: alvo.id })

      toast(avisoDeRemocao(alvo), 'success', {
        acao: {
          rotulo: 'Desfazer',
          onClick: () => {
            clearTimeout(pendentes.current.get(k)?.timer)
            pendentes.current.delete(k)
            mostrar(k)
          },
        },
      })
    },
    [mostrar, toast],
  )

  // Saiu da tela com exclusão pendente: executa agora.
  useEffect(() => {
    const mapa = pendentes.current
    return () => {
      for (const { timer, id } of mapa.values()) {
        clearTimeout(timer)
        void excluirRef.current(id).catch(() => {})
      }
      mapa.clear()
    }
  }, [])

  const oculta = useCallback((alvo: Alvo) => ocultos.has(chave(alvo)), [ocultos])

  return { pedir, oculta }
}
