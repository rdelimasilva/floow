'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { createCategory, updateCategory } from '@/lib/finance/category-actions'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DeleteCategoryDialog } from './delete-category-dialog'
import { sortCategoryTree } from '@/lib/finance/category-options'

interface Category {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer'
  color: string | null
  icon: string | null
  isSystem: boolean
  orgId: string | null
  parentId?: string | null
  affectsCashFlow?: boolean
}

/**
 * Desmarcado: os lancamentos desta categoria somem do fluxo de caixa sem
 * deixar de existir. Serve para aplicacao/resgate de investimento, aporte e
 * emprestimo — dinheiro que se move de verdade e nao e receita nem despesa.
 *
 * Diferente do olho na lista de lancamentos (`isIgnored`), que significa
 * "este lancamento e errado" e o apaga tambem de orcamentos, dividas e CFO.
 */
function CashFlowToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-gray-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer rounded border-gray-300"
      />
      Entra no fluxo de caixa
    </label>
  )
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
  // Categoria antiga vem sem a coluna; o default é o comportamento de hoje.
  const [affectsCashFlow, setAffectsCashFlow] = useState(true)

  function startEdit(cat: Category) {
    setEditingId(cat.id)
    setName(cat.name)
    setType(cat.type as 'income' | 'expense')
    setColor(cat.color ?? '#6b7280')
    setIcon(cat.icon ?? '')
    setAffectsCashFlow(cat.affectsCashFlow ?? true)
  }

  function resetForm() {
    setName('')
    setType('expense')
    setColor('#6b7280')
    setIcon('')
    setAffectsCashFlow(true)
  }

  async function handleCreate() {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('name', name.charAt(0).toUpperCase() + name.slice(1))
      formData.append('type', type)
      if (color) formData.append('color', color)
      if (icon) formData.append('icon', icon)
      formData.append('affectsCashFlow', String(affectsCashFlow))
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
      formData.append('name', name.charAt(0).toUpperCase() + name.slice(1))
      formData.append('type', type)
      if (color) formData.append('color', color)
      if (icon) formData.append('icon', icon)
      formData.append('affectsCashFlow', String(affectsCashFlow))
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

  function handleDeleted() {
    setDeleteTarget(null)
  }

  // Ordem de arvore: a filha aparece logo abaixo do pai, nao perdida na ordem
  // alfabetica global entre outras 140.
  const incomeCategories = sortCategoryTree(categories.filter((c) => c.type === 'income'))
  const expenseCategories = sortCategoryTree(categories.filter((c) => c.type === 'expense'))

  function renderCategoryGroup(title: string, cats: Category[]) {
    return (
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
        <div className="space-y-1">
          {cats.map((cat) => (
            editingId === cat.id ? (
              <div key={cat.id} className="flex items-center gap-2 rounded-lg bg-blue-50 p-3">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 rounded border cursor-pointer" />
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm flex-1" />
                <CashFlowToggle checked={affectsCashFlow} onChange={setAffectsCashFlow} />
                <Button size="sm" variant="outline" onClick={() => { setEditingId(null); resetForm() }} className="h-8">Cancelar</Button>
                <Button size="sm" variant="primary" onClick={() => handleUpdate(cat.id)} disabled={loading} className="h-8">Salvar</Button>
              </div>
            ) : (
              <div
                key={cat.id}
                // A filha recuada mostra a que raiz pertence sem repetir o nome
                // do pai em cada linha.
                className={`flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50 ${cat.parentId ? 'ml-6' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? '#6b7280' }} />
                  <span className="text-sm text-foreground">{cat.name}</span>
                  {cat.affectsCashFlow === false && (
                    <span
                      className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500"
                      title="Os lancamentos desta categoria nao contam como receita ou despesa no fluxo de caixa"
                    >
                      fora do fluxo de caixa
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => startEdit(cat)} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                    Editar
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(cat)} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                    Excluir
                  </button>
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
              <div className="pb-2">
                <CashFlowToggle checked={affectsCashFlow} onChange={setAffectsCashFlow} />
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

      <DeleteCategoryDialog
        target={deleteTarget}
        allCategories={categories}
        onClose={() => setDeleteTarget(null)}
        onDeleted={handleDeleted}
      />
    </>
  )
}
