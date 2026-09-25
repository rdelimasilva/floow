'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateAsset } from '@/lib/investments/actions'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ASSET_CLASS_LABEL, assetDisplayName, type AssetClass } from '@/lib/investments/asset-labels'
import type { Asset } from '@floow/db'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

const ASSET_CLASSES = (Object.entries(ASSET_CLASS_LABEL) as [AssetClass, string][]).map(
  ([value, label]) => ({ value, label })
)

type SerializedAsset = Omit<Asset, 'createdAt' | 'updatedAt'> & {
  createdAt: string | Date
  updatedAt: string | Date
}

interface AssetEditFormProps {
  asset: SerializedAsset
}

export function AssetEditForm({ asset }: AssetEditFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)

  async function handleAction(formData: FormData) {
    setSubmitting(true)
    try {
      formData.append('id', asset.id)
      await updateAsset(formData)
      toast('Ativo atualizado com sucesso')
      router.push('/investments')
    } catch (e) {
      toast(mensagemDeErro(e, 'Erro ao atualizar ativo'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form action={handleAction} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <div>
        <Label htmlFor="ticker">Código (ticker)</Label>
        <Input id="ticker" name="ticker" defaultValue={assetDisplayName(asset)} required />
      </div>

      <div>
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" defaultValue={asset.name} required />
      </div>

      <div>
        <Label htmlFor="assetClass">Classe</Label>
        <select
          id="assetClass"
          name="assetClass"
          defaultValue={asset.assetClass}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          {ASSET_CLASSES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="currency">Moeda</Label>
        <Input id="currency" name="currency" defaultValue={asset.currency} />
      </div>

      <div>
        <Label htmlFor="notes">Observações</Label>
        <Input id="notes" name="notes" defaultValue={asset.notes ?? ''} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
