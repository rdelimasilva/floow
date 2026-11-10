import type { Achado, Severidade } from '@floow/core-finance'
import { cn } from '@/lib/utils'

const BORDA: Record<Severidade, string> = {
  alta: 'border-l-red-600',
  media: 'border-l-orange-500',
  info: 'border-l-gray-400',
}

const ROTULO: Record<Severidade, string> = { alta: 'Alta', media: 'Média', info: 'Informativo' }

export function ListaDeAchados({ achados }: { achados: Achado[] }) {
  if (achados.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center text-sm text-gray-500">
        Nenhum ponto de atenção na carteira hoje.
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {achados.map((a, i) => (
        <li
          key={`${a.ruleId}-${a.posicoes.join(',')}-${i}`}
          className={cn('rounded-md border border-l-4 border-gray-200 bg-white p-4', BORDA[a.severidade])}
        >
          <span className="sr-only">Prioridade {ROTULO[a.severidade]}. </span>
          <h3 className="text-sm font-semibold text-gray-900">{a.titulo}</h3>
          {a.dica && <p className="mt-1 text-sm text-gray-600">{a.dica}</p>}
        </li>
      ))}
    </ul>
  )
}
