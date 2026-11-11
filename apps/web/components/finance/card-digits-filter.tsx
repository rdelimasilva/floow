'use client'

import { ListaComCaixas } from '@/components/finance/filtros/lista-com-caixas'
import type { FinalDoCartao } from '@/lib/finance/queries-final-do-cartao'

interface CardDigitsFilterProps {
  options: FinalDoCartao[]
  selected: string[]
  onChange: (digits: string[]) => void
}

function rotulo(selected: string[]): string {
  if (selected.length === 1) return `Final ${selected[0]}`
  return `${selected.length} finais`
}

/**
 * Filtro por final do cartão: titular, adicional e virtual na mesma fatura.
 *
 * Mesma mecânica do `AccountFilter` — lista de caixas, a marcada se desmarca
 * no clique. A contagem ao lado ajuda a reconhecer o cartão físico (o final
 * com mais compras) no meio dos virtuais de uma compra só.
 */
export function CardDigitsFilter({ options, selected, onChange }: CardDigitsFilterProps) {
  return (
    <ListaComCaixas
      rotulo="Final do cartão"
      rotuloTodos="Todos os finais do cartão"
      opcoes={options.map((o) => ({
        valor: o.digits,
        rotuloTexto: `Final ${o.digits}`,
        rotulo: (
          <>
            <span className="font-mono">•{o.digits}</span>
            <span className="ml-auto text-xs text-gray-500">{o.total}</span>
          </>
        ),
      }))}
      marcados={selected}
      aoMudar={onChange}
      resumo={rotulo}
    />
  )
}
