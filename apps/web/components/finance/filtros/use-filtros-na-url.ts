'use client'

import { useCallback, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { gravarRecorte, recorteDaUrl, temRecorteNaUrl } from '@/lib/finance/recorte'

const CHAVES_DO_RECORTE = ['startDate', 'endDate', 'accountId', 'month']

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
    // Chave de recorte desligada some da URL, mas o cookie precisa saber que ficou vazia.
    const obj: Record<string, string> = Object.fromEntries(novos)
    for (const k of CHAVES_DO_RECORTE) if (over[k] === '') obj[k] = ''
    // Só grava quando a URL traz recorte, senão apagaria o cookie com o padrão.
    if (gravaRecorte && temRecorteNaUrl(obj)) gravarRecorte(recorteDaUrl(obj))
    aoMudar?.(novos)
    startTransition(() => {
      router.replace(`${baseUrl}?${novos.toString()}`, { scroll: false })
    })
  }, [params, router, baseUrl, gravaRecorte, aoMudar])

  return { params, trocar }
}
