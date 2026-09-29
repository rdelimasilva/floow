'use client'

import { formatBRL } from '@floow/core-finance/src/balance'
import type { PendingGroupItem } from '@/lib/openfinance/counterparty-queries'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { transferAccountLabel } from '@/lib/openfinance/transfer-direction'
import { meioDoLancamento } from '@/lib/openfinance/meio-do-lancamento'
import { formatarDia } from '@/lib/formatar-dia'

type Nature = 'income' | 'expense' | 'transfer'
type CategoryOption = { id: string; label: string; type: Nature }
type Override = { nature: Nature; categoryId: string | null; transferAccountId: string | null }
type AccountOption = { id: string; name: string }

interface Props {
  item: PendingGroupItem
  /** Nome da conta do lançamento — um grupo junta lançamentos de contas diferentes. */
  accountName: string | undefined
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
export function ItemRow({ item, accountName, override, categoryOptions, accountOptions, onStartOverride, onSetOverride, onClearOverride }: Props) {
  const categoriesForOverride = categoryOptions.filter((c) => c.type === override?.nature)
  // Mesmo racional do grupo (counterparty-queue-client.tsx): um lançamento
  // débito não pode virar "Receita", e vice-versa.
  const availableNatures = (['expense', 'income', 'transfer'] as const).filter((nature) => {
    if (nature === 'income' && item.amountCents < 0) return false
    if (nature === 'expense' && item.amountCents > 0) return false
    return true
  })

  return (
    <li data-testid={`item-${item.id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="tabular-nums">{formatarDia(item.date)}</span>
          {accountName && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">{accountName}</span>
          )}
        </span>
        <span className="shrink-0 tabular-nums">{item.amountCents >= 0 ? '+' : ''}{formatBRL(item.amountCents)}</span>
      </div>
      {/* Descrição como o banco mandou, inteira, mais o que o extrato traz
          para achar o lançamento lá: meio, cartão, parcela. */}
      <p className="mt-0.5 break-words text-gray-800">{item.description}</p>
      <DetalhesDoExtrato item={item} />

      {override ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {availableNatures.map((nature) => (
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
            <Select value={override.transferAccountId ?? ''} onValueChange={(value) => onSetOverride({ transferAccountId: value })}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={transferAccountLabel(item.amountCents)} />
              </SelectTrigger>
              <SelectContent>
                {accountOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={override.categoryId ?? ''} onValueChange={(value) => onSetOverride({ categoryId: value })}>
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

function DetalhesDoExtrato({ item }: { item: PendingGroupItem }) {
  const meio = meioDoLancamento(item.polpType)
  const detalhes = [
    meio,
    item.cardLastDigits ? `cartão final ${item.cardLastDigits}` : null,
    item.installmentNumber && item.installmentTotal ? `parcela ${item.installmentNumber}/${item.installmentTotal}` : null,
  ].filter((d): d is string => d !== null)
  if (detalhes.length === 0) return null
  return (
    <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-gray-500">
      {detalhes.map((d) => <span key={d}>{d}</span>)}
    </p>
  )
}
