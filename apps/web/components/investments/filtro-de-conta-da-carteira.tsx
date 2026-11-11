'use client'

import { AccountFilter } from '@/components/finance/account-filter'
import { useFiltrosNaUrl } from '@/components/finance/filtros/use-filtros-na-url'
import type { ContaComAtivos } from '@/lib/investments/contas-dos-ativos'

/**
 * Filtro por conta da carteira. Mesmo controle de transações; a escolha vive
 * na URL (`?accountId=a,b`) para o recorte sobreviver ao recarregar. Fora do
 * recorte compartilhado: as contas daqui são só as que guardam ativo.
 */
export function FiltroDeContaDaCarteira({ contas }: { contas: ContaComAtivos[] }) {
  const { params, trocar } = useFiltrosNaUrl('/investments', { gravaRecorte: false })
  const selecionadas = (params.get('accountId') ?? '').split(',').filter(Boolean)

  return <AccountFilter accounts={contas} selected={selecionadas} onChange={(ids) => trocar({ accountId: ids.join(',') })} />
}
