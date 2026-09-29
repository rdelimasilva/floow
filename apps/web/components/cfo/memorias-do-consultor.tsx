'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { apagarMemoriaAction } from '@/lib/consultor/memorias-actions'

interface MemoriaNaTela {
  id: string
  conteudo: string
  createdAt: string
}

export function MemoriasDoConsultor({ memorias }: { memorias: MemoriaNaTela[] }) {
  const [aberta, setAberta] = useState(false)
  const [lista, setLista] = useState(memorias)
  const [, startTransition] = useTransition()

  function apagar(id: string) {
    setLista((atual) => atual.filter((m) => m.id !== id))
    startTransition(() => apagarMemoriaAction(id))
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
