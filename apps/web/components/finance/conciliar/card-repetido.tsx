import { formatBRL } from '@floow/core-finance/src/balance'
import type { Repetido } from '@/lib/finance/conciliacao/fila'
import { Button } from '@/components/ui/button'
import { diaMes } from './card-conta'

/** Estado C do card (spec §2.3): decidir o repetido vem antes de classificar o que pode sumir. */
export function CardRepetido({ repetido, ocupado, onDescartar, onNaoERepetido, onPular }: {
  repetido: Repetido
  ocupado: boolean
  onDescartar: () => void
  onNaoERepetido: () => void
  onPular: () => void
}) {
  const { outro } = repetido
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">O banco parece ter mandado isto duas vezes</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
        <span className="font-medium text-gray-900">{outro.description}</span>
        <span>· {diaMes(outro.date)}</span>
        <span>· {formatBRL(outro.amountCents)}</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          emitido {Math.round(repetido.horasEntreEmissoes)}h antes
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={ocupado} onClick={onDescartar}>Descartar este repetido</Button>
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onNaoERepetido}>Não é repetido</Button>
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onPular}>Pular</Button>
      </div>
    </div>
  )
}
