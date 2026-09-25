'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteFixedAsset } from '@/lib/fixed-assets/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

export function DeleteAssetButton({ assetId, assetName }: { assetId: string; assetName: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', assetId)
      await deleteFixedAsset(formData)
      toast('Bem removido')
      router.push('/fixed-assets')
    } catch (err) {
      toast(mensagemDeErro(err, 'Erro ao remover'), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>Excluir</Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleDelete}
        title="Excluir bem"
        description={`Tem certeza que deseja excluir "${assetName}"? O bem será desativado.`}
        confirmLabel="Excluir"
        loading={loading}
      />
    </>
  )
}
