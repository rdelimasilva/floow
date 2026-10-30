'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { getDetalheDoLancamento, type DetalheDoLancamento } from '@/lib/finance/fluxo-de-caixa-actions'

const ORIGEM: Record<DetalheDoLancamento['origem'], string> = {
  extrato: 'Extrato do banco (Open Finance)',
  manual: 'Lançado à mão',
  arquivo: 'Arquivo importado',
  perna: 'Outra ponta de transferência',
  recorrencia: 'Transação recorrente',
  ajuste: 'Ajuste de saldo',
  investimento: 'Investimento',
  parcela_prevista: 'Parcela prevista',
}

const TIPO: Record<string, string> = { income: 'Receita', expense: 'Despesa', transfer: 'Transferência' }

const dataLonga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

interface Props {
  /** Lançamento aberto; null fecha o popup. */
  id: string | null
  onClose: () => void
}

export function CashFlowLancamentoDialog({ id, onClose }: Props) {
  const [lancamento, setLancamento] = useState<DetalheDoLancamento | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelado = false
    setLancamento(null)
    setErro(false)
    getDetalheDoLancamento(id)
      .then((l) => { if (!cancelado) { if (l) setLancamento(l); else setErro(true) } })
      .catch(() => !cancelado && setErro(true))
    return () => { cancelado = true }
  }, [id])

  // <dialog> nativo com showModal(): prende o foco, fecha no Esc e devolve o
  // foco a quem abriu, como no ConfirmDialog.
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (id && !el.open) el.showModal()
    if (!id && el.open) el.close()
  }, [id])

  const l = id ? lancamento : null
  const linhas: [string, string | null][] = l ? [
    ['Data', dataLonga(l.date)],
    ['Data da compra', l.purchaseDate && l.purchaseDate !== l.date ? dataLonga(l.purchaseDate) : null],
    ['Tipo', TIPO[l.type] ?? l.type],
    ['Conta', l.accountName + (l.cardLastDigits ? ` · cartão final ${l.cardLastDigits}` : '')],
    ['Categoria', l.categoryName ?? 'Sem categoria'],
    ['Parcela', l.installmentNumber && l.installmentTotal ? `${l.installmentNumber} de ${l.installmentTotal}` : null],
    ['Situação', l.balanceApplied ? 'Realizado' : 'Previsto'],
    ['Origem', ORIGEM[l.origem] + (l.recorrente && l.origem !== 'recorrencia' ? ' · recorrente' : '')],
  ] : []
  const transacoes = l && `/transactions?${new URLSearchParams({ search: l.description, startDate: l.date, endDate: l.date, accountId: l.accountId })}`

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="lancamento-titulo"
      onClose={onClose}
      // Clique fora do cartão cai no próprio <dialog> (o backdrop).
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="w-[calc(100%-2rem)] max-w-md bg-white p-0 shadow-xl backdrop:bg-black/40"
      style={{ borderRadius: 14 }}
    >
      {id && (
      <div>
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="lancamento-titulo" className="break-words text-lg font-semibold text-gray-900">
              {l?.description ?? 'Lançamento'}
            </h2>
            {l && <p className="text-xl font-bold tabular-nums text-gray-900">{formatBRL(Math.abs(l.amountCents))}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-1 text-gray-500 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">
          {erro ? (
            <p className="text-sm text-red-600">Não foi possível carregar o lançamento. Tente de novo.</p>
          ) : !l ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <dl className="space-y-2 text-sm">
              {linhas.filter(([, v]) => v).map(([rotulo, valor]) => (
                <div key={rotulo} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{rotulo}</dt>
                  <dd className="text-right text-gray-900">{valor}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {transacoes && (
          <div className="border-t border-gray-200 px-5 py-3 text-right">
            <Link href={transacoes} className="text-sm font-medium text-gray-900 underline-offset-2 hover:underline">
              Abrir em Transações para editar
            </Link>
          </div>
        )}
      </div>
      )}
    </dialog>
  )
}
