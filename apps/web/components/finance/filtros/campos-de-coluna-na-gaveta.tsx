'use client'

import { AmountFilter, CategoryFilter, TypeFilter } from '../column-filter-dropdown'
import { currencyToCents } from '@floow/core-finance/src/balance'

// As colunas que `buildTransactionOrder` sabe ordenar.
const COLUNAS = [
  { valor: 'date', rotulo: 'Data' },
  { valor: 'description', rotulo: 'Descrição' },
  { valor: 'categoryName', rotulo: 'Categoria' },
  { valor: 'type', rotulo: 'Tipo' },
  { valor: 'amountCents', rotulo: 'Valor' },
] as const

const lista = (v: string | null) => (v ?? '').split(',').filter(Boolean)
// A URL guarda centavos; o campo mostra reais.
const emReais = (cents: string) => (cents ? (Number(cents) / 100).toFixed(2).replace('.', ',') : '')

interface Props {
  params: URLSearchParams
  categories: { id: string; name: string; parentId?: string | null }[]
  /** Escreve na URL sem tocar o recorte (mesma chamada da lista no desktop). */
  navigate: (over: Record<string, string>) => void
}

/** Tipo, categoria, valor e ordem: no desktop moram no cabeçalho da tabela, que o celular não tem. */
export function CamposDeColunaNaGaveta({ params, categories, navigate }: Props) {
  const min = params.get('minAmount') ?? ''
  const max = params.get('maxAmount') ?? ''
  const sortBy = params.get('sortBy') || 'date'
  const sortDir = params.get('sortDir') === 'desc' ? 'desc' : 'asc'
  const seletor = 'h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-base text-gray-700'

  return (
    <>
      <TypeFilter selected={lista(params.get('types'))} onChange={(t) => navigate({ types: t.join(',') })} />
      {categories.length > 0 && (
        <CategoryFilter
          categories={categories}
          selected={lista(params.get('categoryIds'))}
          onChange={(ids) => navigate({ categoryIds: ids.join(',') })}
        />
      )}
      {/* `key` refaz o campo quando a URL muda por fora (outro filtro, voltar do navegador). */}
      <AmountFilter
        key={`${min}-${max}`}
        minAmount={emReais(min)}
        maxAmount={emReais(max)}
        onApply={(a, b) => navigate({
          minAmount: a ? String(currencyToCents(a)) : '',
          maxAmount: b ? String(currencyToCents(b)) : '',
        })}
      />
      <div className="space-y-1.5">
        <label htmlFor="gaveta-ordenar" className="text-xs font-medium text-gray-500">Ordenar por</label>
        <div className="flex gap-2">
          <select
            id="gaveta-ordenar"
            value={sortBy}
            onChange={(e) => navigate({ sortBy: e.target.value, sortDir })}
            className={seletor}
          >
            {COLUNAS.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
          </select>
          <select
            aria-label="Direção da ordem"
            value={sortDir}
            onChange={(e) => navigate({ sortBy, sortDir: e.target.value })}
            className={seletor}
          >
            <option value="asc">Crescente</option>
            <option value="desc">Decrescente</option>
          </select>
        </div>
      </div>
    </>
  )
}

/** Quantos filtros de coluna estão ativos; ordem fora do padrão (data, crescente) conta como um. */
export function contarFiltrosDeColuna(params: URLSearchParams): number {
  const ordemFora = (params.get('sortBy') && params.get('sortBy') !== 'date') || params.get('sortDir') === 'desc'
  return [
    params.get('types'),
    params.get('categoryIds'),
    params.get('minAmount') || params.get('maxAmount'),
    ordemFora,
  ].filter(Boolean).length
}
