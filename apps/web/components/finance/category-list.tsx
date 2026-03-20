'use client'

import { useState } from 'react'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { createCategory, updateCategory, deleteCategory } from '@/lib/finance/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Category {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer'
  color: string | null
  icon: string | null
  isSystem: boolean
  orgId: string | null
}

interface CategoryListProps {
  categories: Category[]
}

export function CategoryList({ categories }: CategoryListProps) {
  const { toast } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(false)

  const [name, setName] = useState('')
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [color, setColor] = useState('#6b7280')
  const [icon, setIcon] = useState('')

  function startEdit(cat: Category) {
    setEditingId(cat.id)
    setName(cat.name)
    setType(cat.type as 'income' | 'expense')
    setColor(cat.color ?? '#6b7280')
    setIcon(cat.icon ?? '')
  }

  function resetForm() {
    setName('')
    setType('expense')
    setColor('#6b7280')
    setIcon('')
  }

  async function handleCreate() {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('name', name)
      formData.append('type', type)
      if (color) formData.append('color', color)
      if (icon) formData.append('icon', icon)
      await createCategory(formData)
      setShowCreate(false)
      resetForm()
      toast('Categoria criada com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar categoria', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdate(catId: string) {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', catId)
      formData.append('name', name)
      formData.append('type', type)
      if (color) formData.append('color', color)
      if (icon) formData.append('icon', icon)
      await updateCategory(formData)
      setEditingId(null)
      resetForm()
      toast('Categoria atualizada com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar categoria', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', deleteTarget.id)
      await deleteCategory(formData)
      setDeleteTarget(null)
      toast('Categoria removida com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao remover categoria', 'error')
    } finally {
      setLoading(false)
    }
  }

  const incomeCategories = categories.filter((c) => c.type === 'income')
  const expenseCategories = categories.filter((c) => c.type === 'expense')

  function renderCategoryGroup(title: string, cats: Category[]) {
    return (
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
        <div className="space-y-1">
          {cats.map((cat) => (
            editingId === cat.id ? (
              <div key={cat.id} className="rounded-lg bg-blue-50 p-3 space-y-2">
                <div className="flex items-end gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cor</label>
                    <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 rounded border" />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-xs text-gray-500 mb-1">Nome</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="w-16">
                    <label className="block text-xs text-gray-500 mb-1">Ícone</label>
                    <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏷️" className="h-9 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => { setEditingId(null); resetForm() }} className="h-8">Cancelar</Button>
                  <Button size="sm" variant="primary" onClick={() => handleUpdate(cat.id)} disabled={loading} className="h-8">Salvar</Button>
                </div>
              </div>
            ) : (
              <div key={cat.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: cat.color ? `${cat.color}20` : '#e5e7eb',
                      color: cat.color ?? '#6b7280',
                    }}
                  >
                    {cat.icon && <span>{cat.icon}</span>}
                    {cat.name}
                  </span>
                  {cat.isSystem && <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">padrão</span>}
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => startEdit(cat)} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                    Editar
                  </button>
                  {!cat.isSystem && cat.orgId && (
                    <button type="button" onClick={() => setDeleteTarget(cat)} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            )
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {showCreate ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Nova Categoria</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cor</label>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 rounded border" />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs text-gray-500 mb-1">Nome</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                <select value={type} onChange={(e) => setType(e.target.value as 'income' | 'expense')} className="h-9 rounded-md border border-gray-300 px-3 text-sm">
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                </select>
              </div>
              <div className="w-16">
                <label className="block text-xs text-gray-500 mb-1">Icone</label>
                <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="" className="h-9" />
              </div>
              <Button size="sm" variant="primary" onClick={handleCreate} disabled={loading || !name} className="h-9">Criar</Button>
              <Button size="sm" variant="outline" onClick={() => { setShowCreate(false); resetForm() }} className="h-9">Cancelar</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova Categoria
          </Button>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-6">
          {renderCategoryGroup('Despesas', expenseCategories)}
          {renderCategoryGroup('Receitas', incomeCategories)}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remover categoria"
        description={`Tem certeza que deseja remover "${deleteTarget?.name ?? ''}"? Transacoes com esta categoria ficarao sem categoria.`}
        confirmLabel="Remover"
        loading={loading}
      />
    </>
  )
}
