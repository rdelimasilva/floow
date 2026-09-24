import { formatBRL } from '@floow/core-finance'
import type { ParcelasDaCategoria } from '@/lib/finance/parcelas-a-vencer'

/** Nota sob a categoria: parcelas do cartão que vencem neste mês e ainda não viraram gasto. */
export function ParcelasNaLinha({ parcelas }: { parcelas: ParcelasDaCategoria | undefined }) {
  if (!parcelas || parcelas.totalCents === 0) return null
  const nomes = parcelas.parcelas
    .map((p) => `${p.description} ${p.installmentNumber}/${p.installmentTotal} (${formatBRL(p.amountCents)})`)
    .join(', ')
  return (
    <span className="block text-xs font-normal text-gray-500" title={nomes}>
      {formatBRL(parcelas.totalCents)} em parcelas a vencer
    </span>
  )
}
