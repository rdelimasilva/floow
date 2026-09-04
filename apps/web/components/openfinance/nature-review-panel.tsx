'use client'

import { useEffect, useRef, useState } from 'react'
import { formatBRL } from '@floow/core-finance'
import { createNatureRule } from '@/lib/openfinance/nature-actions'
import { explainSuspect, type SuspectGroup } from '@/lib/openfinance/nature-suspects'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Onde o usuário decide se um grupo de despesa é gasto de verdade.
 *
 * Os DOIS botões criam regra. "É despesa mesmo" não conserta nada e silencia o
 * grupo para sempre — sem esse caminho o alerta reaparece a cada sincronização,
 * e um alerta que não se resolve é um alerta que se aprende a ignorar.
 */

interface Props {
  open: boolean
  onClose: () => void
  groups: SuspectGroup[]
}

/**
 * Identidade de um grupo na tela.
 *
 * `key` sozinho não serve: o detector agrupa por conta MAIS descrição
 * normalizada, e "APLICACAO CDB" existe na conta corrente e na poupança ao
 * mesmo tempo. Chavear estado só pela descrição faz uma decisão numa conta
 * apagar o grupo da outra da lista, sem que regra nenhuma tenha sido criada
 * para ele.
 */
function groupIdentity(group: SuspectGroup): string {
  return `${group.accountId}-${group.key}`
}

export function NatureReviewPanel({ open, onClose, groups }: Props) {
  const { toast } = useToast()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [pendingIdentity, setPendingIdentity] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Set<string>>(new Set())

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  async function decide(group: SuspectGroup, nature: 'expense' | 'transfer') {
    const identity = groupIdentity(group)
    setPendingIdentity(identity)
    try {
      const { reclassified } = await createNatureRule({
        accountId: group.accountId,
        // `matchValue` continua sendo `group.key` puro — é o que
        // `createNatureRule` normaliza e grava como regra para o FUTURO.
        // A identidade composta é só para o estado local da tela.
        matchValue: group.key,
        // O PASSADO vai por id, não por casamento de texto: são exatamente os
        // lançamentos cuja contagem o usuário acabou de ler neste cartão. A
        // tela prometia 12 e o `LIKE` reescrevia um número que ninguém sabia.
        transactionIds: group.transactionIds,
        nature,
      })
      setResolved((prev) => new Set(prev).add(identity))
      toast(
        nature === 'transfer'
          ? `${reclassified} lançamentos deixaram de contar como despesa`
          : 'Grupo confirmado como despesa',
      )
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível salvar', 'error')
    } finally {
      setPendingIdentity(null)
    }
  }

  const pending = groups.filter((group) => !resolved.has(groupIdentity(group)))

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="max-h-[80vh] w-[min(92vw,640px)] overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-gray-900">Estes lançamentos são gasto?</h2>
        <p className="mt-1 text-sm text-gray-600">
          O banco classificou como despesa, mas o padrão sugere outra coisa. Só você pode confirmar.
        </p>

        {pending.length === 0 ? (
          <p className="mt-6 text-sm text-gray-600">Nada mais para revisar por aqui.</p>
        ) : (
          <ul className="mt-6 space-y-4">
            {pending.map((group) => {
              const identity = groupIdentity(group)
              return (
                <li key={identity} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">{group.sample}</p>
                    <p className="shrink-0 text-sm font-semibold text-red-600">
                      {formatBRL(Math.abs(group.totalCents))}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {group.count} lançamentos · {group.accountName}
                  </p>
                  <p className="mt-2 text-xs text-gray-600">{explainSuspect(group)}</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      disabled={pendingIdentity !== null}
                      onClick={() => decide(group, 'transfer')}
                    >
                      {pendingIdentity === identity ? 'Salvando...' : 'É transferência'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pendingIdentity !== null}
                      onClick={() => decide(group, 'expense')}
                    >
                      É despesa mesmo
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-6 flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </dialog>
  )
}
