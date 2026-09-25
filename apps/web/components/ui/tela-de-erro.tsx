'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

interface TelaDeErroProps {
  titulo: string
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Conteúdo comum dos `error.tsx`. A mensagem só aparece quando diz algo ao
 * usuário — o texto que o Next põe no lugar em produção cai no genérico. O
 * código (digest) fica visível para o usuário citar ao pedir ajuda; é o mesmo
 * que aparece no Sentry.
 */
export function TelaDeErro({ titulo, error, reset }: TelaDeErroProps) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  const mensagem = mensagemDeErro(
    error,
    'Não conseguimos carregar esta tela agora. Tente de novo em alguns segundos.',
  )

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-xl font-semibold text-red-600">{titulo}</h2>
      <p className="max-w-md text-sm text-gray-600">{mensagem}</p>
      <div className="flex gap-2">
        <button onClick={reset} className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
          Tentar novamente
        </button>
        <Link href="/dashboard" className="rounded-md border px-4 py-2 text-sm text-gray-700">
          Ir para o início
        </Link>
      </div>
      {error.digest && <p className="text-xs text-gray-400">Código do erro: {error.digest}</p>}
    </div>
  )
}
