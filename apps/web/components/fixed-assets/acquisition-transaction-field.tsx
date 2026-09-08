'use client'

import { formatBRL } from '@floow/core-finance'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AcquisitionCandidate } from '@/lib/fixed-assets/queries'

/**
 * Sentinela para "não vincular". Radix não aceita `SelectItem` com value
 * vazio, e é o valor vazio que faz o placeholder aparecer — então o item de
 * limpar precisa de um valor próprio, traduzido de volta para '' no onChange.
 */
const SEM_VINCULO = '__sem_vinculo__'

interface Props {
  candidates: AcquisitionCandidate[]
  value: string
  onChange: (transactionId: string) => void
}

/**
 * Aponta qual lançamento pagou pelo bem.
 *
 * Um componente só, usado pelo formulário de novo ativo e pelo de edição —
 * o rótulo de tipo de conta viveu duplicado em quatro lugares e divergiu em
 * dois deles, e não vale repetir o erro.
 *
 * O vínculo é opcional: bem cadastrado sem apontar a compra continua válido.
 */
export function AcquisitionTransactionField({ candidates, value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor="acquisitionTransactionId">Lançamento da compra (opcional)</Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v === SEM_VINCULO ? '' : v)}
      >
        <SelectTrigger id="acquisitionTransactionId">
          <SelectValue placeholder="Nenhum lançamento vinculado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM_VINCULO}>Nenhum lançamento vinculado</SelectItem>
          {candidates.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.date.toLocaleDateString('pt-BR')} · {c.description} · {formatBRL(c.amountCents)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Liga o bem à saída de dinheiro que o comprou. O patrimônio continua vindo do valor do
        bem, com a depreciação — o vínculo é só rastreabilidade.
      </p>
    </div>
  )
}
