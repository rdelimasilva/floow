'use client'

import { useEffect, useRef, useState } from 'react'
import type { Candidata } from '@/lib/finance/conciliacao/candidatos'
import { procurarPrevisoes } from '@/lib/finance/conciliacao/vincular-actions'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'
import { LinhaDaCandidata } from './card-candidatos'

const ESPERA_MS = 300

/** Busca dentro do card nas previsões em aberto de todas as contas (spec §2.4). Escolher = Vincular. */
export function ProcurarPrevisao({ realizadoId, ocupado, onVincular, onFechar }: {
  realizadoId: string
  ocupado: boolean
  onVincular: (c: Candidata) => void
  onFechar: () => void
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
    <div className="space-y-2 rounded-lg border border-gray-200 p-3">
      <div className="flex gap-2">
        <input
          autoFocus
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Descrição ou valor da previsão"
          aria-label="Procurar previsão"
          className="h-8 min-w-0 flex-1 rounded-md border border-gray-300 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        <Button variant="outline" size="sm" onClick={onFechar}>Fechar</Button>
      </div>
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
