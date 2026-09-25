'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { deleteTransaction, toggleIgnoreTransaction, bulkDeleteTransactions, bulkCategorizeTransactions } from '@/lib/finance/transaction-actions'
import { cancelRecurring } from '@/lib/finance/recurring-cancel'
import { setTransactionAffectsCashFlow } from '@/lib/finance/cash-flow-actions'
import { nextAffectsCashFlow } from '@/lib/finance/affects-cash-flow-cycle'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useExclusaoComDesfazer } from './use-exclusao-com-desfazer'
import { desconciliarLancamento } from '@/lib/finance/desconciliar-actions'
import { podeDesconciliar } from '@/lib/finance/desconciliar'
import { CreateRuleDialog } from '@/components/finance/create-rule-dialog'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { SortableHeader } from '@/components/finance/sortable-header'
import { TypeFilter, CategoryFilter, AmountFilter } from '@/components/finance/column-filter-dropdown'
import { TransactionMobileCard, TransactionDesktopRow } from './transaction-display-row'
import { TransactionEditRow } from './transaction-edit-row'
import type { TransactionRowData, AccountOption, CategoryOption } from './transaction-list-types'
import { toCategoryOptions } from '@/lib/finance/category-options'
import { contaNoSaldoProjetado } from '@/lib/finance/projected-balance'
import { intercalarFaturas, type FaturaNoExtrato } from '@/lib/finance/intercalar-faturas'
import { FaturaDesktopRow, FaturaMobileCard, chaveDaFatura } from './fatura-row'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

interface TransactionListProps {
  transactions: TransactionRowData[]
  accounts: AccountOption[]
  categories: CategoryOption[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  /** Linhas de total da fatura do cartão, só leitura. Ver `fatura-row.tsx`. */
  faturas?: FaturaNoExtrato[]
  activeTypes?: string[]
  activeCategoryIds?: string[]
  activeMinAmount?: string
  activeMaxAmount?: string
  onSort?: (sortKey: string) => void
  onFilterTypes?: (types: string[]) => void
  onFilterCategories?: (ids: string[]) => void
  onFilterAmount?: (min: string, max: string) => void
  /** A URL tem recorte: lista vazia é culpa do filtro, não da conta. */
  comFiltro?: boolean
}

export function TransactionList({
  transactions: todasAsTransacoes, accounts, categories,
  sortBy = 'date', sortDir = 'desc', faturas,
  activeTypes = [], activeCategoryIds = [],
  activeMinAmount = '', activeMaxAmount = '',
  onSort = () => {}, onFilterTypes = () => {}, onFilterCategories = () => {}, onFilterAmount = () => {},
  comFiltro = false,
}: TransactionListProps) {
  const { toast } = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)

  // Excluir esconde a linha e oferece "Desfazer"; o banco só é tocado quando o aviso expira.
  const exclusao = useExclusaoComDesfazer({
    excluir: (id) => {
      const formData = new FormData()
      formData.append('id', id)
      return deleteTransaction(formData)
    },
    toast,
  })
  const { oculta } = exclusao
  const transactions = useMemo(
    () => todasAsTransacoes.filter((t) => !oculta(t)),
    [todasAsTransacoes, oculta],
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [unreconcileTarget, setUnreconcileTarget] = useState<TransactionRowData | null>(null)
  const [loading, setLoading] = useState(false)
  const [ruleShortcut, setRuleShortcut] = useState<{ matchValue: string; categoryId: string } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<{ templateId: string; description: string } | null>(null)
  // Desligado por padrão: cancelar a recorrência não pode levar histórico sem
  // ser pedido, porque apagar lançamento é irreversível.
  const [limparVencidas, setLimparVencidas] = useState(false)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkCatId, setBulkCatId] = useState<string>('')
  const [showBulkCat, setShowBulkCat] = useState(false)

  const allSelected = transactions.length > 0 && selected.size === transactions.length

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }, [])

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(transactions.map((t) => t.id)))
  }

  // O saldo de cada linha vem pronto do servidor (`runningBalance`), calculado
  // sobre TODOS os lançamentos da conta e não sobre os desta página.
  //
  // Antes era acumulado aqui, a partir de um `startingBalance`. Só funcionava
  // enquanto a página continha todas as linhas relevantes: com "este mês" numa
  // conta, o topo mostrava R$ 323,00 onde o saldo era R$ 140.801,00, porque a
  // base era a soma das linhas exibidas. Filtro escolhe o que aparece; não
  // muda saldo.
  const runningBalances = useMemo(
    () => transactions.map((t) => t.runningBalance ?? 0),
    [transactions],
  )

  const itens = useMemo(
    () => intercalarFaturas(transactions, faturas ?? [], sortDir),
    [transactions, faturas, sortDir],
  )

  // Stable action callbacks for memoized rows
  const handleEdit = useCallback((tx: TransactionRowData) => {
    setEditingId(tx.id)
  }, [])

  const { pedir: pedirExclusao } = exclusao
  const handleDelete = useCallback((tx: TransactionRowData) => pedirExclusao(tx), [pedirExclusao])

  const handleIgnore = useCallback(async (tx: TransactionRowData) => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', tx.id)
      await toggleIgnoreTransaction(formData)
      toastRef.current(tx.isIgnored ? 'Transação restaurada' : 'Transação ignorada')
    } catch (e) {
      toastRef.current(mensagemDeErro(e, 'Não foi possível alterar a transação.'), 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleToggleCashFlow = useCallback(async (tx: TransactionRowData) => {
    // Cicla herda -> fora -> dentro. Action propria e nao updateTransaction:
    // aquela recusa transferencia e refaz a matematica de saldo, que aqui nao
    // muda — o dinheiro se moveu de verdade, so nao e resultado.
    setLoading(true)
    try {
      const proximo = nextAffectsCashFlow(tx.affectsCashFlow, tx.categoryAffectsCashFlow)
      await setTransactionAffectsCashFlow(tx.id, proximo)
      toastRef.current(
        proximo === null
          ? `Volta a seguir a categoria${tx.categoryName ? ` ${tx.categoryName}` : ''} no fluxo de caixa`
          : proximo
            ? 'No fluxo de caixa, só este lançamento'
            : 'Fora do fluxo de caixa, só este lançamento',
      )
    } catch (e) {
      toastRef.current(mensagemDeErro(e, 'Não foi possível alterar o lançamento.'), 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleUnreconcile = useCallback((tx: TransactionRowData) => {
    setUnreconcileTarget(tx)
  }, [])

  const handleCancelRecurring = useCallback((templateId: string, description: string) => {
    setCancelTarget({ templateId, description })
  }, [])

  const handleCreateRule = useCallback((matchValue: string, categoryId: string) => {
    setRuleShortcut({ matchValue, categoryId })
  }, [])

  const closeEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  const rowActions = useMemo(() => ({
    onEdit: handleEdit,
    onDelete: handleDelete,
    onIgnore: handleIgnore,
    onToggleCashFlow: handleToggleCashFlow,
    onCancelRecurring: handleCancelRecurring,
    onCreateRule: handleCreateRule,
    onToggleSelect: toggleSelect,
    onUnreconcile: handleUnreconcile,
  }), [handleEdit, handleDelete, handleIgnore, handleToggleCashFlow, handleCancelRecurring, handleCreateRule, toggleSelect, handleUnreconcile])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const sync = () => setIsDesktop(media.matches)

    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  // Confirm dialog handlers
  async function confirmUnreconcile() {
    if (!unreconcileTarget) return
    setLoading(true)
    try {
      const { fila } = await desconciliarLancamento(unreconcileTarget.id)
      setUnreconcileTarget(null)
      toast(fila === 'previsoes' ? 'Devolvido para Confirmar previsões' : 'Devolvido para Classificar lançamentos')
    } catch (e) {
      toast(mensagemDeErro(e, 'Não foi possível desconciliar.'), 'error')
    } finally {
      setLoading(false)
    }
  }

  async function confirmCancelRecurring() {
    if (!cancelTarget) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('templateId', cancelTarget.templateId)
      if (limparVencidas) formData.append('removeOverdue', '1')
      const { futurasRemovidas, vencidasRemovidas } = await cancelRecurring(formData)
      setCancelTarget(null)
      setLimparVencidas(false)
      // Diz quantas linhas sairam: "parcelas futuras removidas" era a mesma
      // frase apagando 2 ou 40 delas.
      toast(
        vencidasRemovidas > 0
          ? `Recorrência cancelada — ${futurasRemovidas} parcela(s) futura(s) e ${vencidasRemovidas} vencida(s) não conciliada(s) removidas`
          : `Recorrência cancelada — ${futurasRemovidas} parcela(s) futura(s) removida(s)`,
      )
    } catch (e) {
      toast(mensagemDeErro(e, 'Não foi possível cancelar a recorrência.'), 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleBulkDelete() {
    setBulkLoading(true)
    try {
      await bulkDeleteTransactions(Array.from(selected))
      toast(`${selected.size} transações removidas`)
      setSelected(new Set())
      setBulkDeleteOpen(false)
    } catch (e) {
      toast(mensagemDeErro(e, 'Não foi possível remover as transações.'), 'error')
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleBulkCategorize() {
    if (!bulkCatId) return
    setBulkLoading(true)
    try {
      await bulkCategorizeTransactions(Array.from(selected), bulkCatId)
      toast(`${selected.size} transações categorizadas`)
      setSelected(new Set())
      setShowBulkCat(false)
      setBulkCatId('')
    } catch (e) {
      toast(mensagemDeErro(e, 'Não foi possível categorizar as transações.'), 'error')
    } finally {
      setBulkLoading(false)
    }
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
        {comFiltro ? (
          <>
            <p className="text-gray-500">Nenhuma transação com os filtros atuais.</p>
            <p className="mt-1 text-sm text-gray-400">Ajuste ou desligue os filtros acima para ver mais lançamentos.</p>
          </>
        ) : (
          <>
            <p className="text-gray-500">Nenhuma transação encontrada.</p>
            <p className="mt-1 text-sm text-gray-400">Registre sua primeira transação para começar.</p>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 mb-2">
          <span className="text-sm font-medium text-blue-800">{selected.size} selecionadas</span>
          <div className="flex gap-2 ml-auto">
            {showBulkCat ? (
              <div className="flex items-center gap-1.5">
                <select value={bulkCatId} onChange={(e) => setBulkCatId(e.target.value)} className="h-8 rounded border border-gray-300 text-xs">
                  <option value="">Escolher categoria</option>
                  {toCategoryOptions(categories).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <Button size="sm" variant="primary" onClick={handleBulkCategorize} disabled={bulkLoading || !bulkCatId}>Aplicar</Button>
                <Button size="sm" variant="outline" onClick={() => setShowBulkCat(false)}>Cancelar</Button>
              </div>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowBulkCat(true)} disabled={bulkLoading}>Categorizar</Button>
                <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)} disabled={bulkLoading}>Remover</Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={bulkLoading}>Limpar</Button>
          </div>
        </div>
      )}

      {isDesktop === false ? (
        <div className="space-y-2">
          {itens.map((item) => {
            if (item.kind === 'fatura') return <FaturaMobileCard key={chaveDaFatura(item.fatura)} fatura={item.fatura} />
            const { tx, idx } = item
            return (
            <TransactionMobileCard
              key={tx.id}
              tx={tx}
              balance={runningBalances[idx] ?? 0}
              isSelected={selected.has(tx.id)}
              loading={loading}
              actions={rowActions}
            />
            )
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300" />
                </th>
                <SortableHeader label="Data" sortKey="date" currentSortBy={sortBy} currentSortDir={sortDir} onSort={onSort} />
                <SortableHeader label="Descrição" sortKey="description" currentSortBy={sortBy} currentSortDir={sortDir} onSort={onSort} />
                <SortableHeader
                  label="Categoria" sortKey="categoryName" currentSortBy={sortBy} currentSortDir={sortDir} onSort={onSort}
                  hasActiveFilter={activeCategoryIds.length > 0} className="hidden md:table-cell"
                  filterContent={<CategoryFilter categories={categories} selected={activeCategoryIds} onChange={onFilterCategories} />}
                />
                <SortableHeader
                  label="Tipo" sortKey="type" currentSortBy={sortBy} currentSortDir={sortDir} onSort={onSort}
                  hasActiveFilter={activeTypes.length > 0} className="hidden md:table-cell"
                  filterContent={<TypeFilter selected={activeTypes} onChange={onFilterTypes} />}
                />
                <SortableHeader
                  label="Valor" sortKey="amountCents" currentSortBy={sortBy} currentSortDir={sortDir} onSort={onSort}
                  hasActiveFilter={!!activeMinAmount || !!activeMaxAmount} className="text-right"
                  filterContent={<AmountFilter minAmount={activeMinAmount} maxAmount={activeMaxAmount} onApply={onFilterAmount} />}
                />
                <th className="hidden lg:table-cell px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Saldo</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {itens.map((item) => {
                if (item.kind === 'fatura') return <FaturaDesktopRow key={chaveDaFatura(item.fatura)} fatura={item.fatura} />
                const { tx, idx } = item
                return (
                editingId === tx.id && !tx.transferGroupId ? (
                  <TransactionEditRow
                    key={tx.id}
                    tx={tx}
                    accounts={accounts}
                    categories={categories}
                    balance={runningBalances[idx] ?? 0}
                    isSelected={selected.has(tx.id)}
                    onToggleSelect={toggleSelect}
                    onClose={closeEdit}
                  />
                ) : (
                  <TransactionDesktopRow
                    key={tx.id}
                    tx={tx}
                    balance={runningBalances[idx] ?? 0}
                    isSelected={selected.has(tx.id)}
                    loading={loading}
                    actions={rowActions}
                  />
                )
                )
              })}
            </tbody>
          </table>
        </div>
      )}


      <ConfirmDialog
        open={!!unreconcileTarget}
        onClose={() => setUnreconcileTarget(null)}
        onConfirm={confirmUnreconcile}
        title="Desconciliar lançamento"
        description={unreconcileTarget && podeDesconciliar(unreconcileTarget) === 'previsoes'
          ? 'O casamento com a previsão é desfeito e a proposta volta para Confirmar previsões.'
          : 'O lançamento volta para Classificar lançamentos. Se era transferência, a perna criada na outra conta é apagada e o saldo dela, estornado. A regra da contraparte não muda.'}
        confirmLabel="Desconciliar"
        loading={loading}
      />

      <CreateRuleDialog
        open={ruleShortcut !== null}
        onClose={() => setRuleShortcut(null)}
        categories={categories}
        prefill={ruleShortcut ?? undefined}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => { setCancelTarget(null); setLimparVencidas(false) }}
        onConfirm={confirmCancelRecurring}
        title="Cancelar recorrência"
        description={`Tem certeza que deseja cancelar a recorrência "${cancelTarget?.description ?? ''}"? Todas as parcelas futuras serão removidas.`}
        confirmLabel="Cancelar recorrência"
        loading={loading}
      >
        {/* As vencidas e não conciliadas ficavam para trás para sempre: não
            entram em saldo nenhum e, com o template já desativado, nem este
            cancelamento as alcançava de novo. */}
        <label className="flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={limparVencidas}
            onChange={(e) => setLimparVencidas(e.target.checked)}
            className="mt-0.5 rounded border-gray-300"
          />
          <span>
            Remover também as parcelas vencidas e não conciliadas
            <span className="mt-0.5 block text-xs text-gray-500">
              Não mexe em saldo — elas nunca entraram em nenhum. Lançamento já conciliado
              com o banco fica.
            </span>
          </span>
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="Remover transações em lote"
        description={`Tem certeza que deseja remover ${selected.size} transações? Os saldos das contas serão revertidos. Esta ação não pode ser desfeita.`}
        confirmLabel="Remover todas"
        loading={bulkLoading}
      />
    </>
  )
}
