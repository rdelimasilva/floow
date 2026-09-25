'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { desfazerImportacao } from '@/lib/finance/desfazer-importacao'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

interface Props {
  resultado: { imported: number; skipped: number; lote?: string }
  accountId: string
  onNovaImportacao: () => void
}

/** Última etapa da importação: o resumo e a saída para o arquivo errado. */
export function ImportacaoConcluida({ resultado, accountId, onNovaImportacao }: Props) {
  const { toast } = useToast()
  const [confirmando, setConfirmando] = useState(false)
  const [desfazendo, setDesfazendo] = useState(false)
  const podeDesfazer = resultado.imported > 0 && !!resultado.lote

  async function desfazer() {
    if (!resultado.lote) return
    setDesfazendo(true)
    try {
      const removidas = await desfazerImportacao(accountId, resultado.lote)
      toast(`Importação desfeita: ${removidas} lançamentos removidos`)
      setConfirmando(false)
      onNovaImportacao()
    } catch (e) {
      toast(mensagemDeErro(e, 'Não foi possível desfazer a importação.'), 'error')
    } finally {
      setDesfazendo(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importação concluída</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
            <div className="text-3xl font-bold text-green-700">{resultado.imported}</div>
            <div className="mt-1 text-sm text-green-600">importadas</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
            <div className="text-3xl font-bold text-gray-700">{resultado.skipped}</div>
            <div className="mt-1 text-sm text-gray-600">duplicadas (ignoradas)</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/transactions">
            <Button variant="primary">Ver transações</Button>
          </Link>
          <Button variant="outline" onClick={onNovaImportacao}>
            Importar outro arquivo
          </Button>
          {podeDesfazer && (
            <Button variant="ghost" onClick={() => setConfirmando(true)}>
              Desfazer importação
            </Button>
          )}
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmando}
        onClose={() => setConfirmando(false)}
        onConfirm={desfazer}
        title="Desfazer importação"
        description={`Os ${resultado.imported} lançamentos desta importação serão removidos e os saldos voltam ao que eram. As duplicadas ignoradas não são afetadas.`}
        confirmLabel={`Remover ${resultado.imported} lançamentos`}
        loading={desfazendo}
      />
    </Card>
  )
}
