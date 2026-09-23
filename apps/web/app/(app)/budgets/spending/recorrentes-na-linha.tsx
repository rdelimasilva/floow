import Link from 'next/link'
import { formatBRL } from '@floow/core-finance'
import type { LinhaDeMeta } from '@/lib/finance/recurring-budget'

/**
 * Nota sob a categoria quando recorrentes marcadas como meta compõem o orçado.
 * Linha derivada (sem meta manual) diz de onde veio o valor; meta manual
 * abaixo do comprometido avisa que o orçado subiu até o piso.
 */
export function RecorrentesNaLinha({ linha }: { linha: LinhaDeMeta }) {
  if (linha.recorrentesCents === 0) return null

  const nomes = linha.recorrentes.map((r) => `${r.description} (${formatBRL(r.totalCents)})`).join(', ')

  return (
    <span className="block text-xs font-normal text-gray-500" title={nomes}>
      {linha.entryId === null ? (
        <>Meta vinda de <Link href="/transactions/recurring" className="underline">recorrentes</Link></>
      ) : (
        <>Inclui {formatBRL(linha.recorrentesCents)} de <Link href="/transactions/recurring" className="underline">recorrentes</Link></>
      )}
      {linha.abaixoDoPiso && linha.manualCents !== null && (
        <span className="block text-yellow-700">
          Meta de {formatBRL(linha.manualCents)} abaixo do já comprometido; valendo {formatBRL(linha.plannedCents)}
        </span>
      )}
    </span>
  )
}
