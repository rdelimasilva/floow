import { Button } from '@/components/ui/button'

/** Topo da fila (spec §2.1 e §2.5): onde você está, quanto falta e os atalhos à vista. */
export function ProgressoDaFila({ feitos, total }: { feitos: number; total: number }) {
  const largura = total > 0 ? Math.min(100, (feitos / total) * 100) : 0
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
        <span>{`${Math.min(feitos + 1, total)} de ${total}`}</span>
        <span className="hidden sm:block">Enter = botão principal · 1/2/3 = vincular · → = pular</span>
      </div>
      <div className="h-1 rounded-full bg-gray-100">
        <div className="h-1 rounded-full bg-gray-900" style={{ width: `${largura}%` }} />
      </div>
    </div>
  )
}

/** Só restam pulados (spec §2.6): em vez de reabrir o mesmo card, pergunta se é hora de revisá-los. */
export function RevisarPulados({ quantos, onRevisar }: { quantos: number; onRevisar: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-4">
      <p className="text-sm text-gray-700">{`${quantos} ${quantos === 1 ? 'pulado' : 'pulados'}. Revisar agora?`}</p>
      <Button variant="primary" size="sm" onClick={onRevisar}>Revisar agora</Button>
    </div>
  )
}
