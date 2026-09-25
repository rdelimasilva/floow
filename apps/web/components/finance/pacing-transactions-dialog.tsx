'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { formatBRL } from '@floow/core-finance/src/balance'
import {
  getPacingCategoryTransactions,
  type PacingTransaction,
} from '@/lib/finance/budget-pacing-actions'
import { bulkCategorizeTransactions } from '@/lib/finance/transaction-actions'
import { useToast } from '@/components/ui/toast'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

interface Props {
  /** Categoria orçada selecionada; null fecha o popup. */
  category: { id: string; name: string; memberIds: string[] } | null
  month: string
  /** Categorias de despesa para trocar a categoria de um lançamento. */
  categoryOptions?: { id: string; label: string }[]
  onClose: () => void
}

function formatDay(isoDate: string): string {
  const [, m, d] = isoDate.split('-')
  return `${d}/${m}`
}

/** Leva à tela de Transações já filtrada naquele lançamento. */
export function linkDoLancamento(r: PacingTransaction): string {
  const q = new URLSearchParams({ search: r.description, startDate: r.date, endDate: r.date, accountId: r.accountId })
  return `/transactions?${q.toString()}`
}

export function PacingTransactionsDialog({ category, month, categoryOptions = [], onClose }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [rows, setRows] = useState<PacingTransaction[] | null>(null)
  const [error, setError] = useState(false)
  const [trocando, setTrocando] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function trocarCategoria(r: PacingTransaction, categoryId: string) {
    if (!category || !categoryId || categoryId === r.categoryId) return
    setSalvando(true)
    try {
      await bulkCategorizeTransactions([r.id], categoryId)
      const nome = categoryOptions.find((o) => o.id === categoryId)?.label.trim() ?? null
      // Saiu do teto aberto: some da lista. Continua (filha do mesmo teto): só troca o rótulo.
      setRows((prev) =>
        (prev ?? []).flatMap((x) =>
          x.id !== r.id ? [x] : category.memberIds.includes(categoryId) ? [{ ...x, categoryId, categoryName: nome }] : [],
        ),
      )
      setTrocando(null)
      toast(`Lançamento movido para "${nome ?? 'outra categoria'}"`)
      router.refresh()
    } catch (err) {
      toast(mensagemDeErro(err, 'Erro ao trocar categoria'), 'error')
    } finally {
      setSalvando(false)
    }
  }

  useEffect(() => {
    if (!category) return
    let cancelled = false
    setRows(null)
    setError(false)
    getPacingCategoryTransactions(category.memberIds, month)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [category, month])

  useEffect(() => {
    if (!category) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [category, onClose])

  if (!category) return null

  const total = rows?.reduce((s, r) => s + r.spentCents, 0) ?? 0
  // Com filhas no teto, vale mostrar de qual subcategoria veio cada linha.
  const showCategory = category.memberIds.length > 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pacing-tx-title"
        className="flex max-h-[80vh] w-full max-w-lg flex-col bg-white shadow-xl"
        style={{ borderRadius: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 id="pacing-tx-title" className="text-lg font-semibold text-gray-900">
              {category.name}
            </h2>
            {rows && (
              <p className="text-sm" style={{ color: '#6E6E6E' }}>
                {rows.length} {rows.length === 1 ? 'transação' : 'transações'} ·{' '}
                <span className="tabular-nums">{formatBRL(total)}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-2">
          {error ? (
            <p className="py-6 text-center text-sm" style={{ color: '#EB5A4F' }}>
              Não foi possível carregar as transações.
            </p>
          ) : rows === null ? (
            <p className="py-6 text-center text-sm" style={{ color: '#6E6E6E' }}>
              Carregando...
            </p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: '#6E6E6E' }}>
              Nenhuma transação nesta categoria no mês.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{r.description}</p>
                    <p className="truncate text-xs" style={{ color: '#6E6E6E' }}>
                      {formatDay(r.date)} · {r.accountName}
                      {showCategory && r.categoryName ? ` · ${r.categoryName}` : ''}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-xs">
                      <Link href={linkDoLancamento(r)} className="hover:underline" style={{ color: '#4A5899' }}>
                        Abrir
                      </Link>
                      {categoryOptions.length > 0 && trocando !== r.id && (
                        <button
                          type="button"
                          className="hover:underline"
                          style={{ color: '#4A5899' }}
                          onClick={() => setTrocando(r.id)}
                        >
                          Trocar categoria
                        </button>
                      )}
                      {trocando === r.id && (
                        <select
                          aria-label={`Nova categoria de ${r.description}`}
                          className="max-w-[14rem] rounded border px-1 py-0.5"
                          defaultValue={r.categoryId ?? ''}
                          disabled={salvando}
                          onChange={(e) => trocarCategoria(r, e.target.value)}
                          onBlur={() => !salvando && setTrocando(null)}
                          autoFocus
                        >
                          <option value="" disabled>
                            Escolha a categoria
                          </option>
                          {categoryOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <span
                    className="shrink-0 text-sm tabular-nums"
                    style={{ color: r.spentCents < 0 ? '#3F7F76' : '#333' }}
                  >
                    {formatBRL(r.spentCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
