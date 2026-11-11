'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CorpoDaLista } from '@/components/finance/filtros/lista-com-caixas'
import { toCategoryOptions } from '@/lib/finance/category-options'

// ── Type Filter ─────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'income', label: 'Receita' },
  { value: 'expense', label: 'Despesa' },
  { value: 'transfer', label: 'Transferência' },
] as const

interface TypeFilterProps {
  selected: string[]
  onChange: (types: string[]) => void
}

export function TypeFilter({ selected, onChange }: TypeFilterProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-500">Tipo</p>
    <CorpoDaLista
      rotuloTodos="Todos os tipos"
      opcoes={TYPE_OPTIONS.map((o) => ({ valor: o.value, rotulo: o.label }))}
      marcados={selected}
      aoMudar={onChange}
    />
    </div>
  )
}

// ── Category Filter ─────────────────────────────────────────

interface CategoryOption {
  id: string
  name: string
  parentId?: string | null
}

interface CategoryFilterProps {
  categories: CategoryOption[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export function CategoryFilter({ categories, selected, onChange }: CategoryFilterProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-500">Categoria</p>
    <CorpoDaLista
      rotuloTodos="Todas as categorias"
      opcoes={toCategoryOptions(categories).map((c) => ({ valor: c.id, rotulo: c.name }))}
      marcados={selected}
      aoMudar={onChange}
    />
    </div>
  )
}

// ── Amount Filter ───────────────────────────────────────────

interface AmountFilterProps {
  minAmount: string
  maxAmount: string
  onApply: (min: string, max: string) => void
}

export function AmountFilter({ minAmount: initialMin, maxAmount: initialMax, onApply }: AmountFilterProps) {
  const [min, setMin] = useState(initialMin)
  const [max, setMax] = useState(initialMax)

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500">Valor (R$)</p>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          placeholder="Mín"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="h-7 text-xs w-20"
        />
        <span className="text-xs text-gray-500">a</span>
        <Input
          type="text"
          placeholder="Máx"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="h-7 text-xs w-20"
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="primary"
        onClick={() => onApply(min, max)}
        className="h-7 text-xs w-full"
      >
        Aplicar
      </Button>
    </div>
  )
}
