'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { updatePortfolioEvent } from '@/lib/investments/actions'
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
import { useToast } from '@/components/ui/toast'
import type { Asset, Account } from '@floow/db'
import type { PortfolioEventDetail } from '@/lib/investments/queries'

// ── Schema ─────────────────────────────────────────────────────────────────────

const portfolioEventEditSchema = z.object({
  assetId: z.string().uuid('Selecione um ativo'),
  accountId: z.string().uuid('Selecione uma conta'),
  eventType: z.enum(['buy', 'sell', 'dividend', 'interest', 'split', 'amortization'], {
    required_error: 'Selecione o tipo de evento',
  }),
  eventDate: z.string().min(1, 'Data é obrigatória'),
  quantity: z.string().optional(),
  priceCents: z.string().optional(),
  totalCents: z.string().optional(),
  splitRatio: z.string().optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof portfolioEventEditSchema>

// ── Types ─────────────────────────────────────────────────────────────────────

type EventType = 'buy' | 'sell' | 'dividend' | 'interest' | 'split' | 'amortization'

type SerializedEvent = Omit<PortfolioEventDetail, 'eventDate'> & {
  eventDate: string | Date
}

interface PortfolioEventEditFormProps {
  event: SerializedEvent
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
  { value: 'amortization', label: 'Amortização' },
]

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

export function PortfolioEventEditForm({ event, assets, accounts }: PortfolioEventEditFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [eventType, setEventType] = useState<EventType>(event.eventType as EventType)

  const eventDate = event.eventDate instanceof Date
    ? event.eventDate.toISOString().split('T')[0]
    : new Date(event.eventDate as unknown as string).toISOString().split('T')[0]

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(portfolioEventEditSchema),
    defaultValues: {
      assetId: event.assetId,
      accountId: event.accountId,
      eventType: event.eventType as EventType,
      eventDate,
      quantity: event.quantity != null ? String(event.quantity) : '',
      priceCents: event.priceCents != null ? (event.priceCents / 100).toFixed(2).replace('.', ',') : '',
      totalCents: event.totalCents != null ? (event.totalCents / 100).toFixed(2).replace('.', ',') : '',
      splitRatio: event.splitRatio ?? '',
      notes: event.notes ?? '',
    },
  })

  const quantityVal = watch('quantity')
  const priceVal = watch('priceCents')

  /** Convert R$ string to centavos integer */
  function toCents(reais: string): number {
    return Math.round(parseFloat(reais.replace(',', '.')) * 100)
  }

  function getAutoTotalReais(): string | null {
    if ((eventType === 'buy' || eventType === 'sell') && quantityVal && priceVal) {
      const qty = parseInt(quantityVal, 10)
      const price = parseFloat(priceVal.replace(',', '.'))
      if (!isNaN(qty) && !isNaN(price)) {
        return (qty * price).toFixed(2)
      }
    }
    return null
  }

  async function onSubmit(data: FormData) {
    const formData = new window.FormData()
    formData.append('id', event.id)
    formData.append('assetId', data.assetId)
    formData.append('accountId', data.accountId)
    formData.append('eventType', data.eventType)
    formData.append('eventDate', data.eventDate)

    if (data.quantity) formData.append('quantity', data.quantity)
    if (data.priceCents) formData.append('priceCents', String(toCents(data.priceCents)))

    if (data.totalCents) {
      formData.append('totalCents', String(toCents(data.totalCents)))
    } else if (data.priceCents && data.quantity) {
      const qty = parseInt(data.quantity, 10)
      const priceCents = toCents(data.priceCents)
      if (!isNaN(qty) && !isNaN(priceCents)) {
        formData.append('totalCents', String(qty * priceCents))
      }
    }

    if (data.splitRatio) formData.append('splitRatio', data.splitRatio)
    if (data.notes) formData.append('notes', data.notes)

    try {
      await updatePortfolioEvent(formData)
      toast('Evento atualizado com sucesso')
      router.push('/investments/income')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar evento', 'error')
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Editar Evento de Portfolio</h2>
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

        {/* Quantity */}
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

        {/* Price per unit */}
        {showPriceCents(eventType) && (
          <div className="space-y-1.5">
            <Label htmlFor="priceCents">Preço por unidade (R$)</Label>
            <Input
              id="priceCents"
              type="text"
              inputMode="decimal"
              placeholder="Ex: 28,50"
              {...register('priceCents')}
            />
          </div>
        )}

        {/* Total */}
        {showTotalCents(eventType) && (
          <div className="space-y-1.5">
            <Label htmlFor="totalCents">
              {eventType === 'buy' || eventType === 'sell'
                ? 'Valor Total (R$)'
                : 'Valor Recebido (R$)'}
            </Label>
            <Input
              id="totalCents"
              type="text"
              inputMode="decimal"
              placeholder={
                getAutoTotalReais()
                  ? `Auto: R$ ${getAutoTotalReais()}`
                  : 'Ex: 2850,00'
              }
              {...register('totalCents')}
            />
            {(eventType === 'buy' || eventType === 'sell') && getAutoTotalReais() && (
              <p className="text-xs text-gray-400">
                Calculado automaticamente: R$ {getAutoTotalReais()} (deixe em branco para usar)
              </p>
            )}
          </div>
        )}

        {/* Split ratio */}
        {showSplitRatio(eventType) && (
          <div className="space-y-1.5">
            <Label htmlFor="splitRatio">Razão do Desdobramento</Label>
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
            placeholder="Observações sobre este evento..."
            {...register('notes')}
            className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => router.push('/investments/income')}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </form>
    </div>
  )
}
