'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  closingDay: string
  dueDay: string
  onClosingDayChange: (v: string) => void
  onDueDayChange: (v: string) => void
}

/**
 * Fechamento e vencimento do cartão. Com o fechamento cadastrado, o extrato
 * do cartão mostra a linha com o total da fatura — ver
 * `packages/core-finance/src/fatura.ts`.
 */
export function DiasDoCartaoFields({ closingDay, dueDay, onClosingDayChange, onDueDayChange }: Props) {
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
      <p className="text-xs text-gray-500">
        Com o fechamento preenchido, Transações mostra o total de cada fatura. É só leitura:
        não entra no saldo nem no fluxo de caixa.
      </p>
    </div>
  )
}
