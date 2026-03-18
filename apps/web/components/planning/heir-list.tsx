'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeirRow {
  id: string // local-only id for React keys
  name: string
  relationship: string
  percentageShare: number
}

interface HeirListProps {
  heirs: HeirRow[]
  onAdd: () => void
  onRemove: (id: string) => void
  onChange: (id: string, field: keyof Omit<HeirRow, 'id'>, value: string | number) => void
}

// ---------------------------------------------------------------------------
// Relationship options
// ---------------------------------------------------------------------------

const RELATIONSHIP_OPTIONS = [
  { value: 'conjuge', label: 'Cônjuge' },
  { value: 'filho', label: 'Filho(a)' },
  { value: 'neto', label: 'Neto(a)' },
  { value: 'pai_mae', label: 'Pai/Mãe' },
  { value: 'irmao', label: 'Irmão/Irmã' },
  { value: 'outro', label: 'Outro' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HeirList({ heirs, onAdd, onRemove, onChange }: HeirListProps) {
  const totalShare = heirs.reduce((sum, h) => sum + (h.percentageShare || 0), 0)
  const isValid = Math.round(totalShare) === 100
  const isEmpty = heirs.length === 0

  return (
    <div className="space-y-4">
      {/* Headers */}
      {heirs.length > 0 && (
        <div className="grid grid-cols-12 gap-2 px-1">
          <div className="col-span-4">
            <Label className="text-xs text-gray-500">Nome</Label>
          </div>
          <div className="col-span-4">
            <Label className="text-xs text-gray-500">Parentesco</Label>
          </div>
          <div className="col-span-3">
            <Label className="text-xs text-gray-500">Percentual (%)</Label>
          </div>
          <div className="col-span-1" />
        </div>
      )}

      {/* Heir rows */}
      {heirs.map((heir) => (
        <div key={heir.id} className="grid grid-cols-12 gap-2 items-center">
          {/* Name */}
          <div className="col-span-4">
            <Input
              type="text"
              value={heir.name}
              onChange={(e) => onChange(heir.id, 'name', e.target.value)}
              placeholder="Nome do herdeiro"
            />
          </div>

          {/* Relationship */}
          <div className="col-span-4">
            <Select
              value={heir.relationship}
              onValueChange={(v) => onChange(heir.id, 'relationship', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Parentesco" />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Percentage */}
          <div className="col-span-3">
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={heir.percentageShare === 0 ? '' : heir.percentageShare}
              onChange={(e) => onChange(heir.id, 'percentageShare', parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </div>

          {/* Remove button */}
          <div className="col-span-1 flex justify-center">
            <button
              type="button"
              onClick={() => onRemove(heir.id)}
              className="text-gray-400 hover:text-red-600 transition-colors text-lg font-medium leading-none"
              aria-label="Remover herdeiro"
            >
              ×
            </button>
          </div>
        </div>
      ))}

      {/* Empty state */}
      {isEmpty && (
        <p className="text-sm text-gray-500 text-center py-4">
          Nenhum herdeiro adicionado. Clique em &quot;Adicionar Herdeiro&quot; para começar.
        </p>
      )}

      {/* Add button */}
      <Button
        type="button"
        variant="outline"
        onClick={onAdd}
        className="w-full"
      >
        + Adicionar Herdeiro
      </Button>

      {/* Running total */}
      {heirs.length > 0 && (
        <div className="flex justify-between items-center px-1 py-2 border-t border-gray-200">
          <span className="text-sm font-medium text-gray-700">Total:</span>
          <span
            className={`text-sm font-bold ${
              isValid ? 'text-green-700' : 'text-red-600'
            }`}
          >
            {totalShare.toFixed(2)}%
          </span>
        </div>
      )}

      {/* Validation error */}
      {heirs.length > 0 && !isValid && (
        <p className="text-xs text-red-600">
          A soma das porcentagens deve ser exatamente 100%. Atual:{' '}
          {totalShare.toFixed(2)}%
        </p>
      )}
    </div>
  )
}
