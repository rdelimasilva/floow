'use client'

import { useEffect, useRef, useState } from 'react'
import { createNatureRule } from '@/lib/openfinance/nature-actions'
import { groupKey } from '@/lib/openfinance/nature-suspects'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * "Isto não é despesa" a partir de uma linha do extrato.
 *
 * O caminho é o mesmo do painel de revisão: cria regra e reclassifica o
 * histórico daquela conta. A diferença é o ponto de partida — aqui o usuário
 * viu uma linha específica e reconheceu o padrão, em vez de ter sido alertado.
 */

interface Props {
  target: { accountId: string; description: string } | null
  onClose: () => void
}

export function NatureShortcutDialog({ target, onClose }: Props) {
  const { toast } = useToast()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [nature, setNature] = useState<'transfer' | 'income'>('transfer')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (target && !el.open) el.showModal()
    if (!target && el.open) el.close()
  }, [target])

  // Sem retorno antecipado: o `<dialog>` precisa existir no DOM para o efeito
  // acima poder abri-lo quando `target` chegar.
  const key = target ? groupKey(target.description) : ''

  async function confirm() {
    if (!target) return
    setLoading(true)
    try {
      const { reclassified } = await createNatureRule({
        accountId: target.accountId,
        matchValue: key,
        nature,
      })
      toast(`${reclassified} lançamentos reclassificados`)
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível salvar', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      className="rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="w-[min(92vw,480px)] p-6">
        <h2 className="text-lg font-semibold text-gray-900">Reclassificar lançamentos</h2>
        <p className="mt-2 text-sm text-gray-600">
          Todos os lançamentos desta conta cuja descrição contenha{' '}
          <strong className="font-medium text-gray-900">{key}</strong> passam a valer como:
        </p>

        <select
          value={nature}
          onChange={(e) => setNature(e.target.value as 'transfer' | 'income')}
          className="mt-3 h-9 w-full rounded-md border border-gray-300 px-3 text-sm"
        >
          <option value="transfer">Transferência — dinheiro que só mudou de lugar</option>
          <option value="income">Receita — dinheiro que entrou</option>
        </select>

        <p className="mt-3 text-xs text-gray-500">
          O saldo da conta não muda: o valor de cada lançamento continua o mesmo. O que muda é
          deixarem de contar como gasto no orçamento.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" onClick={confirm} disabled={loading}>
            {loading ? 'Salvando...' : 'Reclassificar'}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
