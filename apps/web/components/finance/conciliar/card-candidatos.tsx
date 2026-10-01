import { formatBRL } from '@floow/core-finance/src/balance'
import type { Candidata } from '@/lib/finance/conciliacao/candidatos'
import { Button } from '@/components/ui/button'
import { diaMes } from './card-conta'

function porque(c: Candidata): string {
  const valor = c.diferencaCents === 0 ? 'valor igual' : `${formatBRL(c.diferencaCents)} de diferença`
  return `${valor} · ${c.diasDeDiferenca} ${c.diasDeDiferenca === 1 ? 'dia' : 'dias'}`
}

/** Uma previsão que pode ser este lançamento. Também usada nos resultados de "Procurar previsão". */
export function LinhaDaCandidata({ candidata: c, numero, destaque, ocupado, onVincular }: {
  candidata: Candidata
  numero?: number
  destaque: boolean
  ocupado: boolean
  onVincular: () => void
}) {
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
        destaque ? 'border-primary bg-primary/5' : 'border-gray-200'
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-gray-700">
        {numero !== undefined && <span className="text-gray-500">{numero} ·</span>}
        <span className="font-semibold text-gray-900">{c.description}</span>
        {c.categoriaNome && <span>· {c.categoriaNome}</span>}
        <span>· {c.contaNome}</span>
        <span>· previsto {diaMes(c.date)}</span>
        <span>· {formatBRL(c.amountCents)}</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{porque(c)}</span>
        {c.outraConta && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">outra conta</span>
        )}
      </div>
      <Button variant={destaque ? 'primary' : 'outline'} size="sm" disabled={ocupado} onClick={onVincular}>
        Vincular
      </Button>
    </li>
  )
}

/** Estado A do card (spec §2.3). "É repetido" não aparece: o repetido é decidido antes, no estado C. */
export function CardCandidatos({ candidatas, ocupado, onVincular, onNenhum, onProcurar, onPular }: {
  candidatas: Candidata[]
  ocupado: boolean
  onVincular: (previsaoId: string) => void
  onNenhum: () => void
  onProcurar: () => void
  onPular: () => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">É um destes que você já lançou?</p>
      <ul className="space-y-2">
        {candidatas.map((c, i) => (
          <LinhaDaCandidata
            key={c.id}
            candidata={c}
            numero={i + 1}
            destaque={i === 0}
            ocupado={ocupado}
            onVincular={() => onVincular(c.id)}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onNenhum}>Não é nenhum, lançar como novo</Button>
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onPular}>Pular</Button>
        <Button variant="link" size="sm" disabled={ocupado} onClick={onProcurar}>Procurar previsão</Button>
      </div>
      <p className="text-xs text-gray-500">Ao vincular, a categoria vem da previsão. Não precisa classificar.</p>
    </div>
  )
}
