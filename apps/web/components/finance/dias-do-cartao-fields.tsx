'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  closingDay: string
  dueDay: string
  onClosingDayChange: (v: string) => void
  onDueDayChange: (v: string) => void
  erro?: string | null
}

function diaValido(v: string): boolean {
  const n = Number(v)
  return v.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 31
}

/** O que falta no ciclo do cartão, ou null quando os dois dias estão certos. */
export function erroDoCicloDoCartao(closingDay: string, dueDay: string): string | null {
  if (!diaValido(closingDay) && !diaValido(dueDay)) return 'Informe o dia do fechamento e o do vencimento da fatura (1 a 31).'
  if (!diaValido(closingDay)) return 'Informe o dia do fechamento da fatura (1 a 31).'
  if (!diaValido(dueDay)) return 'Informe o dia do vencimento da fatura (1 a 31).'
  return null
}

/**
 * Fechamento e vencimento do cartão, obrigatórios em todo cartão: a fatura e
 * a data das parcelas saem deles — ver `packages/core-finance/src/fatura.ts`.
 */
export function DiasDoCartaoFields({ closingDay, dueDay, onClosingDayChange, onDueDayChange, erro }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="closingDay">Dia do fechamento</Label>
          <Input
            id="closingDay" type="number" min={1} max={31} inputMode="numeric" placeholder="Ex: 5"
            value={closingDay} onChange={(e) => onClosingDayChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dueDay">Dia do vencimento</Label>
          <Input
            id="dueDay" type="number" min={1} max={31} inputMode="numeric" placeholder="Ex: 15"
            value={dueDay} onChange={(e) => onDueDayChange(e.target.value)}
          />
        </div>
      </div>
      {erro ? (
        <p className="text-xs text-red-600">{erro}</p>
      ) : (
        <p className="text-xs text-gray-500">
          Os dias que aparecem na fatura do cartão. Definem em que fatura cai cada compra e
          quando vence cada parcela.
        </p>
      )}
    </div>
  )
}
