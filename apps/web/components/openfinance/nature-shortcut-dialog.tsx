'use client'

import { useEffect, useRef, useState } from 'react'
import { createNatureRule } from '@/lib/openfinance/nature-actions'
import { groupKey } from '@/lib/openfinance/nature-suspects'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * "Isto não é despesa" a partir de uma linha do extrato.
 *
 * O atalho reclassifica UMA linha — a que o usuário clicou — e cria a regra que
 * vale para o que ainda vai chegar do banco. Não reescreve o resto do extrato:
 * reescrever histórico financeiro em massa sem preview e sem desfazer não se
 * justifica pela conveniência de um clique. Quem quer o grupo inteiro usa o
 * painel de revisão, que mostra a contagem e o valor antes de perguntar.
 *
 * A única natureza oferecida é transferência. O botão que abre este diálogo só
 * aparece em linha de despesa, e despesa tem `amount_cents` negativo: gravar
 * `income` sem trocar o sinal derrubaria a receita do mês em todo dashboard.
 */

interface Props {
  target: { id: string; accountId: string; description: string } | null
  onClose: () => void
}

export function NatureShortcutDialog({ target, onClose }: Props) {
  const { toast } = useToast()
  const dialogRef = useRef<HTMLDialogElement>(null)
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
      await createNatureRule({
        accountId: target.accountId,
        matchValue: key,
        transactionIds: [target.id],
        nature: 'transfer',
      })
      toast('Lançamento reclassificado como transferência')
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
        <h2 className="text-lg font-semibold text-gray-900">Isto não é despesa</h2>
        <p className="mt-2 text-sm text-gray-600">
          Este lançamento passa a valer como{' '}
          <strong className="font-medium text-gray-900">
            transferência — dinheiro que só mudou de lugar
          </strong>
          .
        </p>
        <p className="mt-3 text-sm text-gray-600">
          Os próximos lançamentos desta conta cuja descrição contenha{' '}
          <strong className="font-medium text-gray-900">{key}</strong> seguem a mesma regra assim
          que chegarem do banco. Os que já estão no extrato continuam como estão — para revisar o
          grupo inteiro de uma vez, use o aviso no topo da página.
        </p>

        <p className="mt-3 text-xs text-gray-500">
          O saldo da conta não muda: o valor do lançamento continua o mesmo. O que muda é deixar de
          contar como gasto no orçamento.
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
