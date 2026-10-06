import { formatBRL } from '@floow/core-finance/src/balance'
import type { Candidata } from '@/lib/finance/conciliacao/candidatos'
import { Button } from '@/components/ui/button'
import { diaMes } from './card-conta'

/** Por que o floow acha que é esta (card v2 §C): as marcas do palpite e a distância em dias. */
export function motivo(c: Candidata): string {
  const partes = [
    c.nomeParecido ? '✓ mesmo nome' : null,
    c.diferencaCents === 0 ? '✓ mesmo valor' : `${formatBRL(c.diferencaCents)} de diferença`,
    `${c.diasDeDiferenca} ${c.diasDeDiferenca === 1 ? 'dia' : 'dias'}`,
  ]
  return partes.filter(Boolean).join(' · ')
}

/** Uma previsão que pode ser este lançamento. Também usada nos resultados da busca. */
export function LinhaDaCandidata({ candidata: c, destaque, ocupado, onVincular }: {
  candidata: Candidata
  destaque: boolean
  ocupado: boolean
  onVincular: () => void
}) {
  const bate = c.nomeParecido || c.diferencaCents === 0
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
        destaque ? 'border-gray-900' : 'border-gray-200'
      }`}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-gray-700">
          <span className="font-semibold text-gray-900">{c.description}</span>
          {c.categoriaNome && <span>· {c.categoriaNome}</span>}
          <span>· {c.contaNome}</span>
          {c.outraConta && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">outra conta</span>
          )}
        </p>
        <p className="text-xs text-gray-500">
          previsto {diaMes(c.date)} · {formatBRL(c.amountCents)}
        </p>
        <p className={`text-xs ${bate ? 'text-green-700' : 'text-gray-500'}`}>{motivo(c)}</p>
      </div>
      <Button variant={destaque ? 'primary' : 'outline'} size="sm" disabled={ocupado} onClick={onVincular}>
        Vincular
      </Button>
    </li>
  )
}

/** "Previsões parecidas" (card v2 §C.1): até 3, a primeira em destaque. */
export function ListaDeCandidatas({ candidatas, ocupado, onVincular }: {
  candidatas: Candidata[]
  ocupado: boolean
  onVincular: (c: Candidata) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Previsões parecidas</p>
      {candidatas.length === 0 ? (
        <p className="text-sm text-gray-600">Nenhuma previsão com nome ou valor parecido nesta conta.</p>
      ) : (
        <ul className="space-y-2">
          {candidatas.map((c, i) => (
            <LinhaDaCandidata key={c.id} candidata={c} destaque={i === 0} ocupado={ocupado} onVincular={() => onVincular(c)} />
          ))}
        </ul>
      )}
    </div>
  )
}
