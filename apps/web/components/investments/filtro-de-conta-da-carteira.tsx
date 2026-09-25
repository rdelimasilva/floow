'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { AccountFilter } from '@/components/finance/account-filter'
import type { ContaComAtivos } from '@/lib/investments/contas-dos-ativos'

/**
 * Filtro por conta da carteira. Mesmo controle de transações; a escolha vive
 * na URL (`?accountId=a,b`) para o recorte sobreviver ao recarregar.
 */
export function FiltroDeContaDaCarteira({ contas }: { contas: ContaComAtivos[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const selecionadas = (searchParams.get('accountId') ?? '').split(',').filter(Boolean)

  function trocar(ids: string[]) {
    const params = new URLSearchParams(searchParams.toString())
    if (ids.length > 0) params.set('accountId', ids.join(','))
    else params.delete('accountId')
    const query = params.toString()
    startTransition(() => router.replace(query ? `/investments?${query}` : '/investments', { scroll: false }))
  }

  return <AccountFilter accounts={contas} selected={selecionadas} onChange={trocar} />
}
