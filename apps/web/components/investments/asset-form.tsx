'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createAsset } from '@/lib/investments/actions'
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
import { ASSET_CLASS_LABEL, type AssetClass } from '@/lib/investments/asset-labels'

// ── Labels ─────────────────────────────────────────────────────────────────────

const ASSET_CLASS_OPTIONS = Object.entries(ASSET_CLASS_LABEL) as [AssetClass, string][]
const ASSET_CLASS_VALUES = ASSET_CLASS_OPTIONS.map(([value]) => value) as [AssetClass, ...AssetClass[]]

// ── Schema ─────────────────────────────────────────────────────────────────────

const assetFormSchema = z.object({
  ticker: z.string().min(1, 'Ticker é obrigatório').max(20),
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  assetClass: z.enum(ASSET_CLASS_VALUES, {
    required_error: 'Selecione a classe do ativo',
  }),
  currency: z.string().default('BRL'),
  notes: z.string().optional(),
})

type AssetFormData = z.infer<typeof assetFormSchema>

// ── Component ─────────────────────────────────────────────────────────────────

export function AssetForm() {
  const router = useRouter()
  const [selectedClass, setSelectedClass] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AssetFormData>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      currency: 'BRL',
    },
  })

  async function onSubmit(data: AssetFormData) {
    const formData = new FormData()
    formData.append('ticker', data.ticker)
    formData.append('name', data.name)
    formData.append('assetClass', data.assetClass)
    formData.append('currency', data.currency)
    if (data.notes) formData.append('notes', data.notes)

    await createAsset(formData)
    router.push('/investments')
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Cadastrar Ativo</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Ticker */}
        <div className="space-y-1.5">
          <Label htmlFor="ticker">Ticker</Label>
          <Input
            id="ticker"
            placeholder="Ex: PETR4"
            {...register('ticker')}
          />
          {errors.ticker && (
            <p className="text-xs text-red-600">{errors.ticker.message}</p>
          )}
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input
            id="name"
            placeholder="Ex: Petrobras PN"
            {...register('name')}
          />
          {errors.name && (
            <p className="text-xs text-red-600">{errors.name.message}</p>
          )}
        </div>

        {/* Asset class */}
        <div className="space-y-1.5">
          <Label>Classe</Label>
          <Controller
            name="assetClass"
            control={control}
            render={({ field }) => (
              <Select
                onValueChange={(val) => { field.onChange(val); setSelectedClass(val) }}
                value={field.value}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a classe do ativo" />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_CLASS_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.assetClass && (
            <p className="text-xs text-red-600">{errors.assetClass.message}</p>
          )}
          {/* Helper text for fixed income */}
          {selectedClass === 'fixed_income' && (
            <p className="text-xs text-blue-600">
              Use quantidade 1 e preço como valor total investido
            </p>
          )}
        </div>

        {/* Currency */}
        <div className="space-y-1.5">
          <Label htmlFor="currency">Moeda</Label>
          <Input
            id="currency"
            placeholder="BRL"
            {...register('currency')}
          />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <textarea
            id="notes"
            placeholder="Observações sobre este ativo..."
            {...register('notes')}
            className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => router.push('/investments')}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Cadastrando...' : 'Cadastrar Ativo'}
          </Button>
        </div>
      </form>
    </div>
  )
}
