'use client'

import { useCallback, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CHAVES_DO_RECORTE, gravarRecorte, recorteDaUrl } from '@/lib/finance/recorte'

type Opcoes = {
  /** Grava período e contas no cookie `recorte`. Padrão: true. */
  gravaRecorte?: boolean
  /** Para a tela guardar o que o recorte não cobre (busca, filtros de coluna). */
  aoMudar?: (params: URLSearchParams) => void
}

/** Único caminho para um filtro escrever na URL. */
export function useFiltrosNaUrl(baseUrl: string, opts: Opcoes = {}) {
  const router = useRouter()
  const params = useSearchParams()
  const [, startTransition] = useTransition()
  const { gravaRecorte = true, aoMudar } = opts

  // `aoMudar` inline recria `trocar` a cada render: não use `trocar` como dependência de useEffect.
  const trocar = useCallback((over: Record<string, string>) => {
    const novos = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(over)) {
      if (v) novos.set(k, v)
      else novos.delete(k)
    }
    // Sem `page`: o servidor reabre na página certa para a ordem escolhida.
    novos.delete('page')
    // O recorte só muda no que o usuário mexeu agora: o resto da URL (busca,
    // colunas, contas que a tela não conhece) não toca o cookie. Chave desligada
    // some da URL mas entra vazia, para o cookie saber que ficou vazia.
    const mexidas = CHAVES_DO_RECORTE.filter((k) => k in over)
    if (gravaRecorte && mexidas.length) {
      gravarRecorte(recorteDaUrl(Object.fromEntries(mexidas.map((k) => [k, novos.get(k) ?? '']))))
    }
    aoMudar?.(novos)
    startTransition(() => {
      router.replace(`${baseUrl}?${novos.toString()}`, { scroll: false })
    })
  }, [params, router, baseUrl, gravaRecorte, aoMudar])

  return { params, trocar }
}
