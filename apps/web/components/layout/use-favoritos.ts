'use client'

import { useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { MAX_FAVORITOS } from './nav-config'

/**
 * Favoritos do menu, gravados no `user_metadata` da conta: acompanham a pessoa
 * em qualquer navegador sem tabela nova. O layout lê do token, então depois de
 * salvar a sessão é renovada, como em Configurações.
 */
export function useFavoritos(iniciais: string[]) {
  const [favoritos, setFavoritos] = useState(iniciais)
  const { toast } = useToast()
  // Cliques seguidos gravam a lista inteira; a última gravação é a que vale.
  const atual = useRef(iniciais)

  const alternar = useCallback(async (href: string) => {
    const antes = atual.current
    const fixado = antes.includes(href)
    if (!fixado && antes.length >= MAX_FAVORITOS) {
      toast(`Máximo de ${MAX_FAVORITOS} favoritos. Remova um para adicionar outro.`, 'info')
      return
    }
    const depois = fixado ? antes.filter((h) => h !== href) : [...antes, href]
    atual.current = depois
    setFavoritos(depois)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ data: { sidebar_favorites: depois } })
    if (error) {
      if (atual.current === depois) {
        atual.current = antes
        setFavoritos(antes)
      }
      toast('Não deu para salvar os favoritos. Tente de novo.', 'error')
      return
    }
    await supabase.auth.refreshSession()
  }, [toast])

  return { favoritos, alternar }
}
