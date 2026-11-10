'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Perfil } from '@floow/core-finance'
import { Button } from '@/components/ui/button'
import { salvarPerfilInvestidor } from '@/lib/investments/diagnostico/perfil-action'

const OPCOES: { valor: Perfil; rotulo: string }[] = [
  { valor: 'conservador', rotulo: 'Conservador' },
  { valor: 'moderado', rotulo: 'Moderado' },
  { valor: 'arrojado', rotulo: 'Arrojado' },
]

export function PerguntaDePerfil({ atual }: { atual: Perfil | null }) {
  const router = useRouter()
  const [salvando, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function escolher(perfil: Perfil) {
    setErro(null)
    iniciar(async () => {
      const r = await salvarPerfilInvestidor(perfil)
      if (r.error) setErro(r.error)
      else router.replace('/investments/diagnostico')
    })
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-gray-900">Como você se descreve ao investir?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {OPCOES.map((o) => (
          <Button
            key={o.valor}
            variant={o.valor === atual ? 'primary' : 'outline'}
            disabled={salvando}
            onClick={() => escolher(o.valor)}
          >
            {o.rotulo}
          </Button>
        ))}
      </div>
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </section>
  )
}
