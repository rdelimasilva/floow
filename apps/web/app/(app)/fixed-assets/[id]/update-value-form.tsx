'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateAssetValue } from '@/lib/fixed-assets/actions'
import { currencyToCents } from '@floow/core-finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'

export function UpdateValueForm({ assetId }: { assetId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [value, setValue] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cents = currencyToCents(value)
    if (cents <= 0) return

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', assetId)
      formData.append('currentValueCents', String(cents))
      formData.append('currentValueDate', date)
      await updateAssetValue(formData)
      setValue('')
      toast('Valor atualizado com sucesso')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao atualizar valor', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <Label className="text-xs">Novo Valor (R$)</Label>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex: 400.000,00" className="h-9 w-48" />
      </div>
      <div>
        <Label className="text-xs">Data</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
      </div>
      <Button type="submit" variant="primary" size="sm" disabled={loading || !value} className="h-9">
        {loading ? 'Salvando...' : 'Atualizar'}
      </Button>
    </form>
  )
}
