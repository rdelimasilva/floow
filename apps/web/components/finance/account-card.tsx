'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Banknote, PiggyBank, TrendingUp, CreditCard, Wallet, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatBRL, currencyToCents } from '@floow/core-finance'
import { updateAccount, deleteAccount, adjustAccountBalance } from '@/lib/finance/actions'
import { useToast } from '@/components/ui/toast'
import type { Account } from '@floow/db'

const ACCOUNT_TYPE_CONFIG = {
  checking: { label: 'Conta Corrente', Icon: Banknote },
  savings: { label: 'Poupança', Icon: PiggyBank },
  brokerage: { label: 'Corretora', Icon: TrendingUp },
  credit_card: { label: 'Cartão de Crédito', Icon: CreditCard },
  cash: { label: 'Dinheiro', Icon: Wallet },
} as const

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Conta Corrente' },
  { value: 'savings', label: 'Poupança' },
  { value: 'brokerage', label: 'Corretora' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'cash', label: 'Dinheiro' },
] as const

interface AccountCardProps {
  account: Account
}

export function AccountCard({ account }: AccountCardProps) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(account.name)
  const [type, setType] = useState(account.type)
  const [branch, setBranch] = useState(account.branch ?? '')
  const [accountNumber, setAccountNumber] = useState(account.accountNumber ?? '')
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustNewBalance, setAdjustNewBalance] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjustDate, setAdjustDate] = useState(() => {
    const today = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  })
  const [adjustLoading, setAdjustLoading] = useState(false)

  const config = ACCOUNT_TYPE_CONFIG[account.type]
  const { Icon, label } = config
  const isNegative = account.balanceCents < 0

  async function handleUpdate() {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', account.id)
      formData.append('name', name)
      formData.append('type', type)
      if (branch) formData.append('branch', branch)
      if (accountNumber) formData.append('accountNumber', accountNumber)
      await updateAccount(formData)
      setEditing(false)
      toast('Conta atualizada com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar conta', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdjust() {
    if (!adjustNewBalance.trim()) return
    const newCents = currencyToCents(adjustNewBalance)
    if (!Number.isFinite(newCents)) {
      toast('Valor inválido', 'error')
      return
    }
    setAdjustLoading(true)
    try {
      const formData = new FormData()
      formData.append('accountId', account.id)
      formData.append('newBalanceCents', String(newCents))
      if (adjustDate) formData.append('date', adjustDate)
      if (adjustNote.trim()) formData.append('description', adjustNote.trim())
      const result = await adjustAccountBalance(formData)
      if (result.adjusted) {
        toast(`Saldo ajustado (${result.delta >= 0 ? '+' : ''}${formatBRL(result.delta)})`)
      } else {
        toast('Saldo já estava no valor informado — nenhuma transação criada')
      }
      setShowAdjust(false)
      setAdjustNewBalance('')
      setAdjustNote('')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao ajustar saldo', 'error')
    } finally {
      setAdjustLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', account.id)
      await deleteAccount(formData)
      setConfirmDelete(false)
      toast('Conta removida com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao remover conta', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (editing) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Agência</Label>
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="0001" />
            </div>
            <div>
              <Label>Número</Label>
              <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="12345-6" />
            </div>
          </div>
          <div>
            <Label>Tipo</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={handleUpdate} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setName(account.name); setType(account.type); setBranch(account.branch ?? ''); setAccountNumber(account.accountNumber ?? ''); setShowAdjust(false) }}>
              Cancelar
            </Button>
          </div>

          {/* Adjust balance — creates an income/expense transaction with the delta */}
          <div className="mt-4 border-t border-gray-200 pt-4">
            {!showAdjust ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Saldo atual</p>
                  <p className={`text-base font-semibold ${account.balanceCents < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatBRL(account.balanceCents)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setShowAdjust(true); setAdjustNewBalance('') }}>
                  Ajustar saldo
                </Button>
              </div>
            ) : (
              <div className="space-y-3 rounded-md bg-blue-50/50 p-3">
                <p className="text-xs text-gray-600">
                  Saldo atual: <strong>{formatBRL(account.balanceCents)}</strong>. O ajuste cria uma
                  transação automática com a diferença pra manter histórico consistente.
                </p>
                <div>
                  <Label>Novo saldo</Label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-500">R$</span>
                    <Input
                      autoFocus
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      className="pl-10"
                      value={adjustNewBalance}
                      onChange={(e) => setAdjustNewBalance(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdjust() } }}
                    />
                  </div>
                </div>
                <div>
                  <Label>Data do ajuste</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={adjustDate}
                    onChange={(e) => setAdjustDate(e.target.value)}
                  />
                  <p className="mt-1 text-[10px] text-gray-500">
                    Data em que a transação de ajuste aparecerá no extrato.
                  </p>
                </div>
                <div>
                  <Label>Motivo <span className="text-gray-400 font-normal">(opcional)</span></Label>
                  <Input
                    type="text"
                    placeholder="Ex: reconciliação com extrato"
                    value={adjustNote}
                    onChange={(e) => setAdjustNote(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={handleAdjust} disabled={adjustLoading || !adjustNewBalance.trim()}>
                    {adjustLoading ? 'Ajustando...' : 'Confirmar ajuste'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowAdjust(false); setAdjustNewBalance(''); setAdjustNote('') }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-gray-600">{account.name}</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold tracking-tight ${isNegative ? 'text-red-600' : 'text-green-700'}`}>
            {formatBRL(account.balanceCents)}
          </p>
          {(account.branch || account.accountNumber) && (
            <p className="mt-1 text-xs text-gray-400">
              {[account.branch && `Ag ${account.branch}`, account.accountNumber && `Nº ${account.accountNumber}`].filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-400">{account.currency}</p>
          <Link
            href={`/accounts/${account.id}`}
            className="mt-2 inline-block text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            Ver detalhes →
          </Link>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Remover conta"
        description={`Tem certeza que deseja remover "${account.name}"? A conta será desativada e não aparecerá mais na listagem. As transações associadas serão mantidas.`}
        confirmLabel="Remover"
        loading={loading}
      />
    </>
  )
}
