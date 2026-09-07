'use client'

import { useState } from 'react'
import { formatBRL } from '@floow/core-finance'
import { confirmCounterparty } from '@/lib/openfinance/counterparty-actions'
import type { PendingGroup, ConfirmedCounterparty } from '@/lib/openfinance/counterparty-queries'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { ItemRow } from './counterparty-item-row'

type CategoryOption = { id: string; label: string; type: 'income' | 'expense' | 'transfer' }

interface Props {
  mode: 'blocking' | 'page'
  pending: PendingGroup[]
  confirmed: ConfirmedCounterparty[]
  categoryOptions: CategoryOption[]
}

type Nature = 'income' | 'expense' | 'transfer'

export function CounterpartyQueueClient({ mode, pending: initialPending, confirmed, categoryOptions }: Props) {
  const { toast } = useToast()
  const [pending, setPending] = useState(initialPending)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, { nature: Nature | null; categoryId: string | null }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  // Exceção por lançamento: foge do padrão do grupo sem virar regra da
  // contraparte (ver counterparty-actions.ts). Só existe entrada aqui pros
  // lançamentos que o usuário decidiu destacar — os demais seguem o padrão.
  const [itemOverrides, setItemOverrides] = useState<Record<string, { nature: Nature; categoryId: string | null }>>({})

  function draftFor(id: string) {
    return drafts[id] ?? { nature: null, categoryId: null }
  }

  function setDraft(id: string, patch: Partial<{ nature: Nature | null; categoryId: string | null }>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...draftFor(id), ...patch } }))
  }

  function startOverride(itemId: string, groupDraft: { nature: Nature | null; categoryId: string | null }) {
    setItemOverrides((prev) => ({
      ...prev,
      [itemId]: { nature: groupDraft.nature ?? 'expense', categoryId: groupDraft.categoryId },
    }))
  }

  function setItemOverride(itemId: string, patch: Partial<{ nature: Nature; categoryId: string | null }>) {
    setItemOverrides((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }) as typeof prev)
  }

  function clearOverride(itemId: string) {
    setItemOverrides((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }

  async function confirm(group: PendingGroup) {
    const draft = draftFor(group.counterpartyId)
    if (!draft.nature) {
      toast('Escolha se é receita, despesa ou transferência.', 'error')
      return
    }
    if (draft.nature !== 'transfer' && !draft.categoryId) {
      toast('Escolha uma categoria.', 'error')
      return
    }

    const exceptions: { transactionId: string; nature: Nature; categoryId: string | null; transferAccountId: string | null }[] = []
    for (const item of group.items) {
      const override = itemOverrides[item.id]
      if (!override) continue
      if (override.nature !== 'transfer' && !override.categoryId) {
        toast('Escolha uma categoria para a exceção marcada.', 'error')
        return
      }
      exceptions.push({
        transactionId: item.id,
        nature: override.nature,
        categoryId: override.nature === 'transfer' ? null : override.categoryId,
        transferAccountId: null,
      })
    }

    setSavingId(group.counterpartyId)
    try {
      const { reclassified } = await confirmCounterparty({
        counterpartyId: group.counterpartyId,
        nature: draft.nature,
        categoryId: draft.nature === 'transfer' ? null : draft.categoryId,
        transferAccountId: null,
        exceptions,
      })
      setPending((prev) => prev.filter((g) => g.counterpartyId !== group.counterpartyId))
      setItemOverrides((prev) => {
        const next = { ...prev }
        for (const item of group.items) delete next[item.id]
        return next
      })
      toast(`${reclassified} lançamentos classificados.`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível salvar', 'error')
    } finally {
      setSavingId(null)
    }
  }

  if (pending.length === 0 && mode === 'blocking') {
    // O layout re-renderiza no próximo request e o portão já vai estar
    // destravado (getReviewGateStatus grava o timestamp na hora que zera).
    return <p className="text-sm text-gray-600">Tudo revisado — atualizando…</p>
  }

  return (
    <div className="space-y-6">
      {pending.length === 0 ? (
        <p className="text-sm text-gray-600">Nada pendente.</p>
      ) : (
        <ul className="space-y-4">
          {pending.map((group) => {
            const draft = draftFor(group.counterpartyId)
            const isOpen = expanded.has(group.counterpartyId)
            const categoriesForNature = categoryOptions.filter((c) => c.type === draft.nature)

            return (
              <li key={group.counterpartyId} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-gray-900">{group.displayName}</p>
                  <p className="shrink-0 text-sm font-semibold text-gray-900">{formatBRL(Math.abs(group.totalCents))}</p>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {group.count} lançamento{group.count > 1 ? 's' : ''} ·{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev)
                        if (next.has(group.counterpartyId)) next.delete(group.counterpartyId)
                        else next.add(group.counterpartyId)
                        return next
                      })
                    }
                  >
                    {isOpen ? 'ocultar lançamentos' : 'ver lançamentos'}
                  </button>
                </p>

                {isOpen && (
                  <ul className="mt-2 space-y-2 border-l-2 border-gray-100 pl-3 text-xs text-gray-600">
                    {group.items.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        override={itemOverrides[item.id]}
                        categoryOptions={categoryOptions}
                        onStartOverride={() => startOverride(item.id, draft)}
                        onSetOverride={(patch) => setItemOverride(item.id, patch)}
                        onClearOverride={() => clearOverride(item.id)}
                      />
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(['expense', 'income', 'transfer'] as const).map((nature) => (
                    <Button
                      key={nature}
                      type="button"
                      variant={draft.nature === nature ? 'primary' : 'outline'}
                      onClick={() => setDraft(group.counterpartyId, { nature, categoryId: null })}
                    >
                      {nature === 'expense' ? 'Despesa' : nature === 'income' ? 'Receita' : 'Transferência'}
                    </Button>
                  ))}

                  {draft.nature && draft.nature !== 'transfer' && (
                    <Select
                      value={draft.categoryId ?? undefined}
                      onValueChange={(value) => setDraft(group.counterpartyId, { categoryId: value })}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoriesForNature.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Button
                    type="button"
                    disabled={savingId !== null}
                    onClick={() => confirm(group)}
                  >
                    {savingId === group.counterpartyId ? 'Salvando…' : 'Confirmar'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {mode === 'page' && confirmed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Já confirmadas</h2>
          <p className="mt-1 text-xs text-gray-500">
            Lista das contrapartes já confirmadas, para conferência.
          </p>
          <ul className="mt-3 space-y-2">
            {confirmed.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <span className="text-gray-900">{c.displayName}</span>
                <span className="text-gray-500">
                  {c.nature === 'expense' ? 'Despesa' : c.nature === 'income' ? 'Receita' : 'Transferência'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
