'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { createFixedAssetType, updateFixedAssetType, deleteFixedAssetType } from '@/lib/fixed-assets/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AssetType {
  id: string
  name: string
  isSystem: boolean
  orgId: string | null
}

interface AssetTypeListProps {
  types: AssetType[]
}

export function AssetTypeList({ types }: AssetTypeListProps) {
  const { toast } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AssetType | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')

  function startEdit(t: AssetType) {
    setEditingId(t.id)
    setName(t.name)
  }

  async function handleCreate() {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('name', name.charAt(0).toUpperCase() + name.slice(1))
      await createFixedAssetType(formData)
      setShowCreate(false)
      setName('')
      toast('Tipo criado com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar tipo', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdate(id: string) {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', id)
      formData.append('name', name.charAt(0).toUpperCase() + name.slice(1))
      await updateFixedAssetType(formData)
      setEditingId(null)
      setName('')
      toast('Tipo atualizado com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar tipo', 'error')
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
      await deleteFixedAssetType(formData)
      setDeleteTarget(null)
      toast('Tipo removido com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao remover tipo', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="space-y-6">
        {showCreate ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Novo Tipo</h3>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do tipo" />
              </div>
              <Button size="sm" variant="primary" onClick={handleCreate} disabled={loading || !name.trim()}>Criar</Button>
              <Button size="sm" variant="outline" onClick={() => { setShowCreate(false); setName('') }}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo Tipo
          </Button>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-1">
          {types.map((t) =>
            editingId === t.id ? (
              <div key={t.id} className="flex items-center gap-2 rounded-lg bg-blue-50 p-3">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm flex-1" />
                <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setName('') }}>Cancelar</Button>
                <Button size="sm" variant="primary" onClick={() => handleUpdate(t.id)} disabled={loading}>Salvar</Button>
              </div>
            ) : (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{t.name}</span>
                  {t.isSystem && <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">padrão</span>}
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => startEdit(t)} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                    Editar
                  </button>
                  {!t.isSystem && t.orgId && (
                    <button type="button" onClick={() => setDeleteTarget(t)} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remover tipo"
        description={`Tem certeza que deseja remover "${deleteTarget?.name ?? ''}"?`}
        confirmLabel="Remover"
        loading={loading}
      />
    </>
  )
}
