'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Banknote, PiggyBank, TrendingUp, CreditCard, Wallet, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatBRL } from '@floow/core-finance'
import { updateAccount, deleteAccount } from '@/lib/finance/actions'
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
      await updateAccount(formData)
      setEditing(false)
      toast('Conta atualizada com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar conta', 'error')
    } finally {
      setLoading(false)
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
            <Button size="sm" onClick={handleUpdate} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setName(account.name); setType(account.type) }}>
              Cancelar
            </Button>
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
          <p className="mt-1 text-xs text-gray-400">{account.currency}</p>
          <Link
            href={`/transactions?accountId=${account.id}`}
            className="mt-2 inline-block text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            Ver transações →
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
