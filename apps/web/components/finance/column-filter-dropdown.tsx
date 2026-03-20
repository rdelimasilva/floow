'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-500">Tipo</p>
      {TYPE_OPTIONS.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            className="rounded border-gray-300"
          />
          {opt.label}
        </label>
      ))}
    </div>
  )
}

// ── Category Filter ─────────────────────────────────────────

interface CategoryOption {
  id: string
  name: string
}

interface CategoryFilterProps {
  categories: CategoryOption[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export function CategoryFilter({ categories, selected, onChange }: CategoryFilterProps) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((v) => v !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-500">Categoria</p>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {categories.map((cat) => (
          <label key={cat.id} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(cat.id)}
              onChange={() => toggle(cat.id)}
              className="rounded border-gray-300"
            />
            {cat.name}
          </label>
        ))}
      </div>
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
        <span className="text-xs text-gray-400">a</span>
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
