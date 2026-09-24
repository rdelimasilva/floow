'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { confirmCounterparty } from '@/lib/openfinance/counterparty-actions'
import type { PendingGroup, ConfirmedCounterparty } from '@/lib/openfinance/counterparty-queries'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { transferAccountLabel } from '@/lib/openfinance/transfer-direction'
import { avisoDeContaDeDestino } from '@/lib/openfinance/transfer-conflict'
import { ItemRow } from './counterparty-item-row'

type CategoryOption = { id: string; label: string; type: 'income' | 'expense' | 'transfer' }
type AccountOption = { id: string; name: string }

interface Props {
  mode: 'blocking' | 'page'
  pending: PendingGroup[]
  confirmed: ConfirmedCounterparty[]
  categoryOptions: CategoryOption[]
  accountOptions: AccountOption[]
}

type Nature = 'income' | 'expense' | 'transfer'

export function CounterpartyQueueClient({ mode, pending: initialPending, confirmed, categoryOptions, accountOptions }: Props) {
  const { toast } = useToast()
  const [pending, setPending] = useState(initialPending)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, { nature: Nature | null; categoryId: string | null; transferAccountId: string | null }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  // Exceção por lançamento: foge do padrão do grupo sem virar regra da
  // contraparte (ver counterparty-actions.ts). Só existe entrada aqui pros
  // lançamentos que o usuário decidiu destacar — os demais seguem o padrão.
  const [itemOverrides, setItemOverrides] = useState<Record<string, { nature: Nature; categoryId: string | null; transferAccountId: string | null }>>({})

  function draftFor(id: string) {
    if (drafts[id]) return drafts[id]
    // O banco já disse que é transferência em todos os lançamentos do grupo:
    // abre em Transferência, falta só a conta.
    const grupo = pending.find((g) => g.counterpartyId === id)
    const soTransferencia = Boolean(grupo?.items.length) && grupo!.items.every((i) => i.type === 'transfer')
    return { nature: soTransferencia ? ('transfer' as Nature) : null, categoryId: null, transferAccountId: null }
  }

  function setDraft(id: string, patch: Partial<{ nature: Nature | null; categoryId: string | null; transferAccountId: string | null }>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...draftFor(id), ...patch } }))
  }

  function startOverride(
    itemId: string,
    amountCents: number,
    groupDraft: { nature: Nature | null; categoryId: string | null; transferAccountId: string | null },
  ) {
    // O padrão do grupo pode ser 'expense' com o lançamento em crédito (ou
    // vice-versa) quando a exceção é justamente pra corrigir a natureza —
    // só herda o padrão do grupo se ele bater com a direção deste item.
    const fallback = amountCents < 0 ? 'expense' : 'income'
    const nature =
      groupDraft.nature && !(groupDraft.nature === 'income' && amountCents < 0) && !(groupDraft.nature === 'expense' && amountCents > 0)
        ? groupDraft.nature
        : fallback
    setItemOverrides((prev) => ({
      ...prev,
      [itemId]: { nature, categoryId: nature === groupDraft.nature ? groupDraft.categoryId : null, transferAccountId: nature === groupDraft.nature ? groupDraft.transferAccountId : null },
    }))
  }

  function setItemOverride(itemId: string, patch: Partial<{ nature: Nature; categoryId: string | null; transferAccountId: string | null }>) {
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
    if (draft.nature === 'transfer' && !draft.transferAccountId) {
      toast('Escolha a conta de destino.', 'error')
      return
    }
    if (draft.nature !== 'transfer' && !draft.categoryId) {
      toast('Escolha uma categoria.', 'error')
      return
    }
    // Rede de segurança: o botão já fica desabilitado com aviso na tela, mas
    // enviar um lote que o servidor vai recusar inteiro não pode depender só
    // do estado do botão.
    const conflito = avisoDoGrupo(group) ?? avisoDasExcecoes(group)
    if (conflito) {
      toast(conflito, 'error')
      return
    }

    const exceptions: { transactionId: string; nature: Nature; categoryId: string | null; transferAccountId: string | null }[] = []
    for (const item of group.items) {
      const override = itemOverrides[item.id]
      if (!override) continue
      if (override.nature === 'transfer' && !override.transferAccountId) {
        toast('Escolha a conta de destino da exceção marcada.', 'error')
        return
      }
      if (override.nature !== 'transfer' && !override.categoryId) {
        toast('Escolha uma categoria para a exceção marcada.', 'error')
        return
      }
      exceptions.push({
        transactionId: item.id,
        nature: override.nature,
        categoryId: override.nature === 'transfer' ? null : override.categoryId,
        transferAccountId: override.nature === 'transfer' ? override.transferAccountId : null,
      })
    }

    setSavingId(group.counterpartyId)
    try {
      const { reclassified } = await confirmCounterparty({
        counterpartyId: group.counterpartyId,
        nature: draft.nature,
        categoryId: draft.nature === 'transfer' ? null : draft.categoryId,
        transferAccountId: draft.nature === 'transfer' ? draft.transferAccountId : null,
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

  /**
   * O aviso de "destino igual à conta do lançamento", quando houver.
   *
   * Só olha os lançamentos que seguem o padrão do grupo: quem tem exceção
   * própria não é afetado pela conta do grupo — o mesmo recorte que o servidor
   * faz entre `applyTransferBatch` e as exceções.
   */
  function avisoDoGrupo(group: PendingGroup): string | null {
    const draft = draftFor(group.counterpartyId)
    if (draft.nature !== 'transfer') return null
    const semExcecao = group.items.filter((item) => !itemOverrides[item.id])
    return avisoDeContaDeDestino(semExcecao, draft.transferAccountId, accountOptions)
  }

  /** Exceção que aponta para a própria conta do lançamento dela. */
  function avisoDasExcecoes(group: PendingGroup): string | null {
    for (const item of group.items) {
      const override = itemOverrides[item.id]
      if (!override || override.nature !== 'transfer') continue
      const aviso = avisoDeContaDeDestino([item], override.transferAccountId, accountOptions)
      if (aviso) {
        const nome = accountOptions.find((a) => a.id === item.accountId)?.name
        return `A exceção de "${item.description}" aponta para ${nome ?? 'a própria conta'}, que é a conta do próprio lançamento. Escolha outra conta de destino.`
      }
    }
    return null
  }

  function renderGroup(group: PendingGroup) {
    const draft = draftFor(group.counterpartyId)
    const isOpen = expanded.has(group.counterpartyId)
    const categoriesForNature = categoryOptions.filter((c) => c.type === draft.nature)
    const aviso = avisoDoGrupo(group) ?? avisoDasExcecoes(group)
    // Um grupo é de entrada OU saída — direção já faz parte da chave da
    // contraparte (mesmo tax_id de saída e de entrada nunca colidem, ver
    // spec de 04/09). "Receita" não faz sentido pra quem só tem débito
    // aqui, e vice-versa.
    const availableNatures = (['expense', 'income', 'transfer'] as const).filter((nature) => {
      if (nature === 'income' && group.totalCents < 0) return false
      if (nature === 'expense' && group.totalCents > 0) return false
      return true
    })

    return (
      <li key={group.counterpartyId} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-gray-900">{group.displayName}</p>
                  <p className="shrink-0 text-sm font-semibold text-gray-900">
                    {group.totalCents >= 0 ? '+' : ''}{formatBRL(group.totalCents)}
                  </p>
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
                        accountOptions={accountOptions}
                        onStartOverride={() => startOverride(item.id, item.amountCents, draft)}
                        onSetOverride={(patch) => setItemOverride(item.id, patch)}
                        onClearOverride={() => clearOverride(item.id)}
                      />
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {availableNatures.map((nature) => (
                    <Button
                      key={nature}
                      type="button"
                      variant={draft.nature === nature ? 'primary' : 'outline'}
                      onClick={() => setDraft(group.counterpartyId, { nature, categoryId: null, transferAccountId: null })}
                    >
                      {nature === 'expense' ? 'Despesa' : nature === 'income' ? 'Receita' : 'Transferência'}
                    </Button>
                  ))}

                  {draft.nature === 'transfer' && (
                    <Select
                      value={draft.transferAccountId ?? ''}
                      onValueChange={(value) => setDraft(group.counterpartyId, { transferAccountId: value })}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder={transferAccountLabel(group.totalCents)} />
                      </SelectTrigger>
                      <SelectContent>
                        {accountOptions.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {draft.nature && draft.nature !== 'transfer' && (
                    <Select
                      value={draft.categoryId ?? ''}
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
                    disabled={savingId !== null || aviso !== null}
                    onClick={() => confirm(group)}
                  >
                    {savingId === group.counterpartyId ? 'Salvando…' : 'Confirmar'}
                  </Button>
                </div>

                {/* O servidor recusa destino igual à conta de origem. O aviso
                    vem aqui, antes do envio, em vez de o lote inteiro morrer
                    com a mensagem crua da exceção. */}
                {aviso && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600" role="alert">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {aviso}
                  </p>
                )}
              </li>
    )
  }

  const entradas = pending.filter((g) => g.totalCents >= 0)
  const saidas = pending.filter((g) => g.totalCents < 0)

  return (
    <div className="space-y-6">
      {pending.length === 0 ? (
        <p className="text-sm text-gray-600">Nada pendente.</p>
      ) : (
        <>
          {entradas.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Entradas</h2>
              <ul className="mt-2 space-y-4">{entradas.map(renderGroup)}</ul>
            </div>
          )}
          {saidas.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Saídas</h2>
              <ul className="mt-2 space-y-4">{saidas.map(renderGroup)}</ul>
            </div>
          )}
        </>
      )}

      {mode === 'page' && confirmed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Já confirmadas</h2>
          <p className="mt-1 text-xs text-gray-500">
            Quem você já classificou. Vale para os lançamentos futuros também.
          </p>
          <ul className="mt-3 space-y-2">
            {confirmed.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <span className="text-gray-900">{c.displayName}</span>
                <span className="text-gray-500">
                  {c.nature === 'expense' ? 'Despesa' : c.nature === 'income' ? 'Receita' : `Transferência · ${c.transferAccountName ?? '?'}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
