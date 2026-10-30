'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sellFixedAsset } from '@/lib/fixed-assets/actions'
import { formatBRL } from '@floow/core-finance/src/balance'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'
import { formatarDia } from '@/lib/formatar-dia'
import type { AcquisitionCandidate } from '@/lib/fixed-assets/queries'

// A escolha fica no card e não no diálogo: o Select abre em portal no body e
// ficaria atrás do <dialog> modal.
export function SellAssetForm({ assetId, assetName, candidates }: {
  assetId: string
  assetName: string
  candidates: AcquisitionCandidate[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [transactionId, setTransactionId] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const escolhida = candidates.find((c) => c.id === transactionId)

  async function handleSell() {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', assetId)
      formData.append('saleTransactionId', transactionId)
      await sellFixedAsset(formData)
      setOpen(false)
      toast('Venda registrada')
      router.refresh()
    } catch (err) {
      toast(mensagemDeErro(err, 'Erro ao registrar a venda'), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="saleTransactionId" className="text-xs">Lançamento que recebeu o dinheiro</Label>
        <Select value={transactionId} onValueChange={setTransactionId}>
          <SelectTrigger id="saleTransactionId">
            <SelectValue placeholder="Escolha a entrada da venda" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {formatarDia(c.date)} · {c.description} · {formatBRL(c.amountCents)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Data e valor da venda saem desse lançamento. O bem deixa de contar no patrimônio, e o
          dinheiro já está na conta.
        </p>
      </div>
      <Button variant="primary" size="sm" disabled={!transactionId} onClick={() => setOpen(true)}>
        Registrar venda
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleSell}
        title="Registrar venda"
        description={escolhida
          ? `"${assetName}" vendido em ${formatarDia(escolhida.date)} por ${formatBRL(escolhida.amountCents)}. O bem sai do patrimônio.`
          : ''}
        confirmLabel="Registrar venda"
        loading={loading}
      />
    </div>
  )
}
