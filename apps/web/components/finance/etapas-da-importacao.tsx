import { cn } from '@/lib/utils'

const ETAPAS = [
  { chave: 'select-file', rotulo: 'Arquivo' },
  { chave: 'preview', rotulo: 'Prévia' },
  { chave: 'reconciliation', rotulo: 'Duplicatas' },
  { chave: 'review', rotulo: 'Revisão' },
  { chave: 'done', rotulo: 'Concluída' },
] as const

/** Onde o usuário está na importação. "importing" é a revisão sendo gravada. */
export function EtapasDaImportacao({ step }: { step: string }) {
  const atual = ETAPAS.findIndex((e) => e.chave === (step === 'importing' ? 'review' : step))

  return (
    <nav aria-label="Etapas da importação" className="space-y-2">
      <p className="text-xs text-gray-500">Etapa {atual + 1} de {ETAPAS.length}</p>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {ETAPAS.map((etapa, i) => (
          <li
            key={etapa.chave}
            aria-current={i === atual ? 'step' : undefined}
            className={cn(
              i === atual ? 'font-semibold text-gray-900' : i < atual ? 'text-gray-600' : 'text-gray-400',
            )}
          >
            {i + 1}. {etapa.rotulo}
          </li>
        ))}
      </ol>
    </nav>
  )
}
