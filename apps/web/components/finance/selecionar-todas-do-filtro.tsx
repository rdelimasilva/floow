'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { idsDoFiltro } from '@/lib/finance/ids-do-filtro'
import { LIMITE_DA_SELECAO } from '@/lib/finance/filtros-da-url'
import { useToast } from '@/components/ui/toast'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

interface Props {
  paginaToda: boolean
  naPagina: number
  selecionadas: number
  totalDoFiltro: number
  onSelecionar: (ids: string[]) => void
}

/**
 * Com a página toda marcada, oferece estender a seleção ao filtro inteiro — o
 * padrão do Gmail. Acima do limite, seleciona as primeiras e diz quantas.
 */
export function SelecionarTodasDoFiltro({ paginaToda, naPagina, selecionadas, totalDoFiltro, onSelecionar }: Props) {
  const searchParams = useSearchParams()
  const [carregando, setCarregando] = useState(false)
  const { toast } = useToast()

  if (!paginaToda || totalDoFiltro <= naPagina) return null

  if (selecionadas >= Math.min(totalDoFiltro, LIMITE_DA_SELECAO)) {
    return (
      <span className="text-xs text-blue-800">
        {totalDoFiltro > LIMITE_DA_SELECAO
          ? `As primeiras ${LIMITE_DA_SELECAO} de ${totalDoFiltro} do filtro estão selecionadas.`
          : `Todas as ${totalDoFiltro} do filtro estão selecionadas.`}
      </span>
    )
  }

  async function selecionar() {
    setCarregando(true)
    try {
      const { ids } = await idsDoFiltro(searchParams.toString())
      onSelecionar(ids)
    } catch (e) {
      toast(mensagemDeErro(e, 'Não foi possível selecionar as transações do filtro.'), 'error')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <button type="button" onClick={selecionar} disabled={carregando} className="text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900">
      {carregando ? 'Selecionando...' : `Selecionar todas as ${totalDoFiltro} do filtro`}
    </button>
  )
}
