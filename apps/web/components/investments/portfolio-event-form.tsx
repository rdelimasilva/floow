'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createPortfolioEvent } from '@/lib/investments/actions'
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
import type { Asset, Account } from '@floow/db'

// ── Schema ─────────────────────────────────────────────────────────────────────

const portfolioEventFormSchema = z.object({
  assetId: z.string().uuid('Selecione um ativo'),
  accountId: z.string().uuid('Selecione uma conta'),
  eventType: z.enum(['buy', 'sell', 'dividend', 'interest', 'split', 'amortization'], {
    required_error: 'Selecione o tipo de evento',
  }),
  eventDate: z.string().min(1, 'Data e obrigatoria'),
  quantity: z.string().optional(),
  priceCents: z.string().optional(),
  totalCents: z.string().optional(),
  splitRatio: z.string().optional(),
  notes: z.string().optional(),
})

type PortfolioEventFormData = z.infer<typeof portfolioEventFormSchema>

// ── Types ─────────────────────────────────────────────────────────────────────

type EventType = 'buy' | 'sell' | 'dividend' | 'interest' | 'split' | 'amortization'

interface PortfolioEventFormProps {
  assets: Asset[]
  accounts: Account[]
}

// ── Labels ─────────────────────────────────────────────────────────────────────

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'buy', label: 'Compra' },
  { value: 'sell', label: 'Venda' },
  { value: 'dividend', label: 'Dividendo' },
  { value: 'interest', label: 'Juros / JCP' },
  { value: 'split', label: 'Desdobramento' },
  { value: 'amortization', label: 'Amortizacao' },
]

// Determines field visibility per event type
function showQuantity(type: EventType): boolean {
  return type === 'buy' || type === 'sell' || type === 'split'
}

function showPriceCents(type: EventType): boolean {
  return type === 'buy' || type === 'sell'
}

function showTotalCents(type: EventType): boolean {
  return type === 'buy' || type === 'sell' || type === 'dividend' || type === 'interest' || type === 'amortization'
}

function showSplitRatio(type: EventType): boolean {
  return type === 'split'
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PortfolioEventForm({ assets, accounts }: PortfolioEventFormProps) {
  const router = useRouter()
  const [eventType, setEventType] = useState<EventType>('buy')

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PortfolioEventFormData>({
    resolver: zodResolver(portfolioEventFormSchema),
    defaultValues: {
      eventDate: new Date().toISOString().split('T')[0],
    },
  })

  const quantityVal = watch('quantity')
  const priceVal = watch('priceCents')

  // Auto-compute totalCents for buy/sell as qty * price (display hint only)
  function getAutoTotal(): string | null {
    if ((eventType === 'buy' || eventType === 'sell') && quantityVal && priceVal) {
      const qty = parseInt(quantityVal, 10)
      const price = parseInt(priceVal, 10)
      if (!isNaN(qty) && !isNaN(price)) {
        return String(qty * price)
      }
    }
    return null
  }

  async function onSubmit(data: PortfolioEventFormData) {
    const formData = new FormData()
    formData.append('assetId', data.assetId)
    formData.append('accountId', data.accountId)
    formData.append('eventType', data.eventType)
    formData.append('eventDate', data.eventDate)

    if (data.quantity) formData.append('quantity', data.quantity)
    if (data.priceCents) formData.append('priceCents', data.priceCents)

    // For buy/sell, auto-compute total if not provided
    if (data.totalCents) {
      formData.append('totalCents', data.totalCents)
    } else {
      const autoTotal = getAutoTotal()
      if (autoTotal) formData.append('totalCents', autoTotal)
    }

    if (data.splitRatio) formData.append('splitRatio', data.splitRatio)
    if (data.notes) formData.append('notes', data.notes)

    await createPortfolioEvent(formData)
    router.push('/investments')
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Registrar Evento de Portfolio</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* Asset select */}
        <div className="space-y-1.5">
          <Label>Ativo</Label>
          <Controller
            name="assetId"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o ativo" />
                </SelectTrigger>
                <SelectContent>
                  {assets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.ticker} — {asset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.assetId && (
            <p className="text-xs text-red-600">{errors.assetId.message}</p>
          )}
        </div>

        {/* Account select */}
        <div className="space-y-1.5">
          <Label>Conta</Label>
          <Controller
            name="accountId"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acct) => (
                    <SelectItem key={acct.id} value={acct.id}>
                      {acct.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.accountId && (
            <p className="text-xs text-red-600">{errors.accountId.message}</p>
          )}
        </div>

        {/* Event type select */}
        <div className="space-y-1.5">
          <Label>Tipo de Evento</Label>
          <Controller
            name="eventType"
            control={control}
            render={({ field }) => (
              <Select
                onValueChange={(val) => {
                  field.onChange(val)
                  setEventType(val as EventType)
                }}
                value={field.value}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.eventType && (
            <p className="text-xs text-red-600">{errors.eventType.message}</p>
          )}
        </div>

        {/* Event date */}
        <div className="space-y-1.5">
          <Label htmlFor="eventDate">Data do Evento</Label>
          <Input
            id="eventDate"
            type="date"
            {...register('eventDate')}
          />
          {errors.eventDate && (
            <p className="text-xs text-red-600">{errors.eventDate.message}</p>
          )}
        </div>

        {/* Quantity (hidden for dividend/interest/amortization) */}
        {showQuantity(eventType) && (
          <div className="space-y-1.5">
            <Label htmlFor="quantity">Quantidade</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              placeholder="Ex: 100"
              {...register('quantity')}
            />
          </div>
        )}

        {/* Price per unit (hidden for split, dividend, interest, amortization) */}
        {showPriceCents(eventType) && (
          <div className="space-y-1.5">
            <Label htmlFor="priceCents">Preco por unidade (centavos)</Label>
            <Input
              id="priceCents"
              type="number"
              min={1}
              placeholder="Ex: 2850 = R$28,50"
              {...register('priceCents')}
            />
            <p className="text-xs text-gray-500">Informe em centavos. Ex: R$28,50 = 2850</p>
          </div>
        )}

        {/* Total cents (shown for buy/sell/dividend/interest/amortization) */}
        {showTotalCents(eventType) && (
          <div className="space-y-1.5">
            <Label htmlFor="totalCents">
              {eventType === 'buy' || eventType === 'sell'
                ? 'Valor Total (centavos)'
                : 'Valor Recebido (centavos)'}
            </Label>
            <Input
              id="totalCents"
              type="number"
              min={1}
              placeholder={
                getAutoTotal()
                  ? `Auto: ${getAutoTotal()} centavos`
                  : 'Ex: 285000 = R$2.850,00'
              }
              {...register('totalCents')}
            />
            {(eventType === 'buy' || eventType === 'sell') && getAutoTotal() && (
              <p className="text-xs text-gray-400">
                Calculado automaticamente: {getAutoTotal()} centavos (deixe em branco para usar)
              </p>
            )}
          </div>
        )}

        {/* Split ratio (only for split events) */}
        {showSplitRatio(eventType) && (
          <div className="space-y-1.5">
            <Label htmlFor="splitRatio">Razao do Desdobramento</Label>
            <Input
              id="splitRatio"
              type="text"
              placeholder="Ex: 2.0000 para desdobramento 2:1"
              {...register('splitRatio')}
            />
            <p className="text-xs text-gray-500">
              Para 2:1 (dobra quantidade) insira 2.0000
            </p>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <textarea
            id="notes"
            placeholder="Observacoes sobre este evento..."
            {...register('notes')}
            className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => router.push('/investments')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Registrando...' : 'Registrar Evento'}
          </Button>
        </div>
      </form>
    </div>
  )
}
