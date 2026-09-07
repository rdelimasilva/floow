'use client'

import { formatBRL } from '@floow/core-finance'
import type { PendingGroupItem } from '@/lib/openfinance/counterparty-queries'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Nature = 'income' | 'expense' | 'transfer'
type CategoryOption = { id: string; label: string; type: Nature }
type Override = { nature: Nature; categoryId: string | null; transferAccountId: string | null }
type AccountOption = { id: string; name: string }

interface Props {
  item: PendingGroupItem
  override: Override | undefined
  categoryOptions: CategoryOption[]
  accountOptions: AccountOption[]
  onStartOverride: () => void
  onSetOverride: (patch: Partial<Override>) => void
  onClearOverride: () => void
}

/**
 * Um lançamento dentro do grupo expandido. Por padrão segue a
 * natureza/categoria escolhida pro grupo inteiro; "usar classificação
 * diferente" abre uma exceção só pra este lançamento (ver
 * `confirmCounterparty` em `lib/openfinance/counterparty-actions.ts` — a
 * exceção não muda a regra gravada na contraparte).
 */
export function ItemRow({ item, override, categoryOptions, accountOptions, onStartOverride, onSetOverride, onClearOverride }: Props) {
  const categoriesForOverride = categoryOptions.filter((c) => c.type === override?.nature)

  return (
    <li data-testid={`item-${item.id}`}>
      <div className="flex justify-between gap-3">
        <span>{item.date.slice(0, 10)} · {item.description}</span>
        <span>{formatBRL(Math.abs(item.amountCents))}</span>
      </div>

      {override ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {(['expense', 'income', 'transfer'] as const).map((nature) => (
            <Button
              key={nature}
              type="button"
              variant={override.nature === nature ? 'primary' : 'outline'}
              onClick={() => onSetOverride({ nature, categoryId: null })}
            >
              {nature === 'expense' ? 'Despesa' : nature === 'income' ? 'Receita' : 'Transferência'}
            </Button>
          ))}

          {override.nature === 'transfer' ? (
            <Select value={override.transferAccountId ?? undefined} onValueChange={(value) => onSetOverride({ transferAccountId: value })}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Conta de destino" />
              </SelectTrigger>
              <SelectContent>
                {accountOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={override.categoryId ?? undefined} onValueChange={(value) => onSetOverride({ categoryId: value })}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                {categoriesForOverride.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <button type="button" className="underline" onClick={onClearOverride}>
            usar padrão do grupo
          </button>
        </div>
      ) : (
        <button type="button" className="mt-1 text-gray-500 underline" onClick={onStartOverride}>
          usar classificação diferente
        </button>
      )}
    </li>
  )
}
