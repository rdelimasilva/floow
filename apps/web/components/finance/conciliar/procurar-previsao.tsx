'use client'

import { useEffect, useRef, useState } from 'react'
import type { Candidata } from '@/lib/finance/conciliacao/candidatos'
import { procurarPrevisoes } from '@/lib/finance/conciliacao/vincular-actions'
import { useToast } from '@/components/ui/toast'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'
import { LinhaDaCandidata } from './card-candidatos'

const ESPERA_MS = 300

/**
 * Busca sempre visível no card (card v2 §C.2) nas previsões em aberto de
 * todas as contas. Escolher = Vincular. Sem autofoco: com o foco no campo,
 * os atalhos da fila não disparam.
 */
export function ProcurarPrevisao({ realizadoId, ocupado, onVincular }: {
  realizadoId: string
  ocupado: boolean
  onVincular: (c: Candidata) => void
}) {
  const { toast } = useToast()
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<Candidata[] | null>(null)
  // Só a resposta da última busca vale: uma lenta que chega depois não sobrescreve.
  const ultima = useRef(0)

  useEffect(() => {
    const t = termo.trim()
    if (!t) {
      setResultados(null)
      return
    }
    const esta = ++ultima.current
    const timer = setTimeout(async () => {
      try {
        const r = await procurarPrevisoes(realizadoId, t)
        if (esta === ultima.current) setResultados(r)
      } catch (error) {
        if (esta === ultima.current) toast(mensagemDeErro(error, 'Não foi possível buscar as previsões'), 'error')
      }
    }, ESPERA_MS)
    return () => clearTimeout(timer)
  }, [termo, realizadoId, toast])

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Procurar previsão por nome ou valor…"
        aria-label="Procurar previsão"
        className="h-9 w-full rounded-md border border-gray-300 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
      />
      {resultados !== null && resultados.length === 0 && (
        <p className="text-sm text-gray-600">Nenhuma previsão em aberto com esse termo.</p>
      )}
      {resultados !== null && resultados.length > 0 && (
        <ul className="space-y-2">
          {resultados.map((c) => (
            <LinhaDaCandidata key={c.id} candidata={c} destaque={false} ocupado={ocupado} onVincular={() => onVincular(c)} />
          ))}
        </ul>
      )}
    </div>
  )
}
