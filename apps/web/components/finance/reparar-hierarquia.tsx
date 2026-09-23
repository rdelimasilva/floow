'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { repararHierarquiaDeCategorias } from '@/lib/finance/category-actions'

/**
 * Conserta, uma vez por visita, filhas que ficaram órfãs em renames antigos de
 * categoria-mãe de sistema. Roda como action (e não no render da página)
 * porque precisa invalidar o cache das categorias; só recarrega se mudou algo.
 */
export function RepararHierarquia() {
  const router = useRouter()
  const rodou = useRef(false)

  useEffect(() => {
    if (rodou.current) return
    rodou.current = true
    repararHierarquiaDeCategorias()
      .then((alteradas) => {
        if (alteradas > 0) router.refresh()
      })
      .catch((err) => console.error('[category] reparo da hierarquia falhou', err))
  }, [router])

  return null
}
