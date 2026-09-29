'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { apagarMemoriaAction } from '@/lib/consultor/memorias-actions'

interface MemoriaNaTela {
  id: string
  conteudo: string
  createdAt: string
}

const ERRO_PADRAO = 'Não foi possível apagar agora. Tente de novo.'

export function MemoriasDoConsultor({ memorias }: { memorias: MemoriaNaTela[] }) {
  const [aberta, setAberta] = useState(false)
  const [lista, setLista] = useState(memorias)
  const [erro, setErro] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function apagar(id: string) {
    const indice = lista.findIndex((m) => m.id === id)
    if (indice === -1) return
    const removida = lista[indice]
    setLista((atual) => atual.filter((m) => m.id !== id))
    setErro(null)
    startTransition(async () => {
      try {
        const r = await apagarMemoriaAction(id)
        if (r.error) {
          setLista((atual) => [...atual.slice(0, indice), removida, ...atual.slice(indice)])
          setErro(r.error)
        }
      } catch {
        setLista((atual) => [...atual.slice(0, indice), removida, ...atual.slice(indice)])
        setErro(ERRO_PADRAO)
      }
    })
  }

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium"
      >
        {aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        O que o consultor sabe sobre você ({lista.length})
      </button>
      {aberta && (
        <div className="border-t px-4 py-3">
          {erro && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {erro}
            </p>
          )}
          {lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Conforme você conversa, o consultor anota seus objetivos, preferências e restrições para aconselhar do seu jeito.
            </p>
          ) : (
            <ul className="space-y-2">
              {lista.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p>{m.conteudo}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Apagar"
                    onClick={() => apagar(m.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
