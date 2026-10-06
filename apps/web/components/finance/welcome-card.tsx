'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BarraDeProgresso } from '@/components/onboarding/guia-primeiros-passos'
import { usePassosPulados } from '@/components/onboarding/use-passos-pulados'
import { passosDoCadastro, resumoDoCadastro, type EstadoDoCadastro } from '@/lib/onboarding/primeiros-passos'

interface WelcomeCardProps {
  estado: Omit<EstadoDoCadastro, 'pulados'>
}

const CHAVE_DISPENSADO = 'floow:onboarding-dismissed'

/**
 * Resumo do passo a passo no topo do dashboard: o progresso e o próximo
 * passo. O guia inteiro fica em /accounts/primeiros-passos.
 */
export function WelcomeCard({ estado }: WelcomeCardProps) {
  const [dismissed, setDismissed] = useState(false)
  const { pulados } = usePassosPulados()

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(CHAVE_DISPENSADO) === 'true')
    } catch {
      // Sem armazenamento o card volta a cada visita; aceitável.
    }
  }, [])

  function handleDismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(CHAVE_DISPENSADO, 'true')
    } catch {
      // idem
    }
  }

  const passos = passosDoCadastro({ ...estado, pulados })
  const resumo = resumoDoCadastro(passos)
  const proximo = passos.find((p) => p.id === resumo.atual)

  if (dismissed || !proximo) return null

  return (
    <div className="relative rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-3 right-3 rounded-md p-1 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Fechar guia"
      >
        <X className="h-4 w-4" />
      </button>

      <h2 className="text-lg font-semibold text-gray-900">
        {resumo.concluidos === 0 ? 'Bem-vindo ao floow!' : 'Continue de onde parou'}
      </h2>
      <p className="mt-1 mb-4 text-sm text-gray-500">
        Cadastre suas contas para o dashboard mostrar para onde vai o seu dinheiro.
      </p>

      <BarraDeProgresso concluidos={resumo.concluidos} total={resumo.total} />

      <div className="mt-5 rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Próximo passo</p>
        <p className="mt-1 text-sm font-medium text-gray-900">{proximo.titulo}</p>
        <p className="mt-0.5 text-sm text-gray-600">{proximo.explicacao}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button asChild variant="primary">
            <Link href={proximo.acao.href}>{proximo.acao.rotulo}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/accounts/primeiros-passos">Ver passo a passo</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
