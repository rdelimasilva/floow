'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PendingSuggestion } from '@/lib/finance/category-suggestion-queries'

interface Props {
  suggestion: PendingSuggestion | null
  parentOptions: { id: string; name: string }[]
  loading: boolean
  onClose: () => void
  onConfirm: (name: string, parentCategoryId: string | null) => void
}

export function AcceptSuggestionDialog({ suggestion, parentOptions, loading, onClose, onConfirm }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')

  useEffect(() => {
    if (!suggestion) return
    setName(suggestion.suggestedName)
    setParentId(suggestion.parentCategoryId ?? '')
  }, [suggestion])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (suggestion && !el.open) el.showModal()
    if (!suggestion && el.open) el.close()
  }, [suggestion])

  return (
    <dialog ref={ref} onClose={onClose} className="rounded-lg p-0 backdrop:bg-black/40">
      <form
        className="w-[min(92vw,420px)] space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onConfirm(name.trim(), parentId || null)
        }}
      >
        <h2 className="text-base font-semibold">Criar categoria sugerida</h2>
        <label className="block space-y-1 text-sm">
          <span>Nome da categoria</span>
          <input
            aria-label="Nome da categoria"
            className="w-full rounded-md border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Categoria mãe</span>
          <select className="w-full rounded-md border px-3 py-2" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Nenhuma (categoria principal)</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          Os lançamentos dos últimos 12 meses desse estabelecimento vão para a categoria nova, e os próximos entram nela automaticamente.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={loading || !name.trim()}>Criar categoria</Button>
        </div>
      </form>
    </dialog>
  )
}
