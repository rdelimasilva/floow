'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createFixedAsset } from '@/lib/fixed-assets/actions'
import { currencyToCents } from '@floow/core-finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface TypeOption {
  id: string
  name: string
}

interface AssetFormProps {
  types: TypeOption[]
}

export function AssetForm({ types }: AssetFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState('')
  const [purchaseValue, setPurchaseValue] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [annualRate, setAnnualRate] = useState('')
  const [address, setAddress] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [model, setModel] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const valueCents = currencyToCents(purchaseValue)
      if (valueCents <= 0) {
        setError('Valor deve ser maior que zero')
        setLoading(false)
        return
      }

      const rate = parseFloat(annualRate) / 100
      if (isNaN(rate)) {
        setError('Taxa anual inválida')
        setLoading(false)
        return
      }

      const formData = new FormData()
      formData.append('name', name)
      formData.append('typeId', typeId)
      formData.append('purchaseValueCents', String(valueCents))
      formData.append('purchaseDate', purchaseDate)
      formData.append('annualRate', String(rate))
      if (address) formData.append('address', address)
      if (licensePlate) formData.append('licensePlate', licensePlate)
      if (model) formData.append('model', model)

      await createFixedAsset(formData)
      router.push('/fixed-assets')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar ativo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/fixed-assets"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Ativos Imobilizados
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novo Ativo Imobilizado</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Apartamento Centro"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="typeId">Tipo</Label>
              <Select value={typeId} onValueChange={setTypeId} required>
                <SelectTrigger id="typeId">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="purchaseValue">Valor de Compra (R$)</Label>
                <Input
                  id="purchaseValue"
                  value={purchaseValue}
                  onChange={(e) => setPurchaseValue(e.target.value)}
                  placeholder="Ex: 350.000,00"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchaseDate">Data de Compra</Label>
                <Input
                  id="purchaseDate"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="annualRate">Taxa Anual (%)</Label>
              <Input
                id="annualRate"
                value={annualRate}
                onChange={(e) => setAnnualRate(e.target.value)}
                placeholder="Ex: 3 (valoriza) ou -10 (deprecia)"
                required
              />
              <p className="text-xs text-gray-400">
                Positivo = valorização, negativo = depreciação
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="model">
                Modelo{' '}
                <span className="text-gray-400 font-normal">(opcional)</span>
              </Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Ex: Honda Civic 2022"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">
                Endereço{' '}
                <span className="text-gray-400 font-normal">(opcional)</span>
              </Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Rua das Flores, 123"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="licensePlate">
                Placa{' '}
                <span className="text-gray-400 font-normal">(opcional)</span>
              </Label>
              <Input
                id="licensePlate"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
                placeholder="Ex: ABC-1234"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/fixed-assets')}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={
                  loading || !name || !typeId || !purchaseValue || !annualRate
                }
              >
                {loading ? 'Cadastrando...' : 'Cadastrar Ativo'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
