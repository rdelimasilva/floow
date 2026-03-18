'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { updateAssetSchema, type UpdateAssetInput } from '@floow/shared'
import { updateAsset } from '@/lib/investments/actions'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Asset } from '@floow/db'

const ASSET_CLASSES = [
  { value: 'br_equity', label: 'Ações BR' },
  { value: 'fii', label: 'FIIs' },
  { value: 'etf', label: 'ETFs' },
  { value: 'crypto', label: 'Cripto' },
  { value: 'fixed_income', label: 'Renda Fixa' },
  { value: 'international', label: 'Internacional' },
] as const

interface AssetEditFormProps {
  asset: Asset
}

export function AssetEditForm({ asset }: AssetEditFormProps) {
  const router = useRouter()
  const { toast } = useToast()

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<UpdateAssetInput>({
    resolver: zodResolver(updateAssetSchema),
    defaultValues: {
      id: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      assetClass: asset.assetClass,
      currency: asset.currency,
      notes: asset.notes ?? '',
    },
  })

  async function onSubmit(data: UpdateAssetInput) {
    try {
      const formData = new FormData()
      formData.append('id', data.id)
      formData.append('ticker', data.ticker)
      formData.append('name', data.name)
      formData.append('assetClass', data.assetClass)
      formData.append('currency', data.currency)
      if (data.notes) formData.append('notes', data.notes)
      await updateAsset(formData)
      toast('Ativo atualizado com sucesso')
      router.push('/investments')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar ativo', 'error')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <input type="hidden" {...register('id')} />

      <div>
        <Label>Ticker</Label>
        <Input {...register('ticker')} />
        {errors.ticker && <p className="text-xs text-red-600 mt-1">{errors.ticker.message}</p>}
      </div>

      <div>
        <Label>Nome</Label>
        <Input {...register('name')} />
        {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <Label>Classe</Label>
        <select
          {...register('assetClass')}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          {ASSET_CLASSES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        {errors.assetClass && <p className="text-xs text-red-600 mt-1">{errors.assetClass.message}</p>}
      </div>

      <div>
        <Label>Moeda</Label>
        <Input {...register('currency')} />
      </div>

      <div>
        <Label>Observações</Label>
        <Input {...register('notes')} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/investments')}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
