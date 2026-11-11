'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { gravarRecorte, recorteDaUrl, recorteDoNavegador, type Recorte } from '@/lib/finance/recorte'

const CHAVES = ['startDate', 'endDate', 'accountId', 'month']

/**
 * Chegada com recorte na URL (link, menu, importação) grava o recorte que a
 * tela está mostrando: a URL é a fonte da verdade, então chave ausente é
 * "aberto" (sem data / sem conta). Contas que esta tela não lista
 * (investimento) ficam no cookie: ela não as aplica nem as apaga.
 * `contasDaTela` null: a tela não tem filtro de conta, as contas ficam como estão.
 */
export function useGravarRecorteNaChegada(contasDaTela: { id: string }[] | null) {
  const searchParams = useSearchParams()
  const chaves = CHAVES.map((k) => searchParams.get(k) ?? '').concat(
    String(CHAVES.some((k) => searchParams.has(k))),
  ).join('|')
  useEffect(() => {
    const p = Object.fromEntries(new URLSearchParams(searchParams.toString()))
    if (!CHAVES.some((k) => p[k] !== undefined)) return
    const lido = recorteDaUrl(p)
    if (!Object.keys(lido).length) return // `month` inválido não apaga o período
    const { startDate = '', endDate = '', accountIds } = lido
    const parcial: Partial<Recorte> = { startDate, endDate }
    if (contasDaTela) {
      const doUrl = accountIds ?? []
      const naoListadas = (recorteDoNavegador()?.accountIds ?? []).filter((id) => !contasDaTela.some((a) => a.id === id) && !doUrl.includes(id))
      parcial.accountIds = [...doUrl, ...naoListadas]
    }
    gravarRecorte(parcial)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- só as chaves de recorte importam; `contasDaTela` chega como array novo a cada render
  }, [chaves])
}
