import type { ItemDaFila } from '@/lib/finance/conciliacao/fila'
import type { Candidata } from '@/lib/finance/conciliacao/candidatos'
import { Button } from '@/components/ui/button'
import { diaMes, rotuloDaConta, valorComSinal } from './card-conta'
import { CardRepetido } from './card-repetido'
import { PainelDeDecisao } from './painel-de-decisao'
import type { AccountOption, CategoryOption, Decisao } from './card-classificar'
import type { Palpite } from './palpite'

export interface AcoesDaLinha {
  onDescartar: () => void
  onNaoERepetido: () => void
  onVincular: (c: Candidata) => void
  onLancar: () => void
  onNenhum: () => void
  onMudar: (d: Decisao) => void
}

/**
 * Uma linha da lista (spec 2026-10-13 §2): quem, quando, quanto e o palpite,
 * com um botão. O detalhe — as peças do modo foco — só abre a pedido.
 */
export function LinhaDaFila({
  item, palpite, decisao, marcado, aberto, onMarcar, onAbrir, onPalpite, acoes, categoryOptions, accountOptions,
}: {
  item: ItemDaFila
  palpite: Palpite
  decisao: Decisao | null
  marcado: boolean
  aberto: boolean
  onMarcar: (marcado: boolean) => void
  onAbrir: () => void
  onPalpite: () => void
  acoes: AcoesDaLinha
  categoryOptions: CategoryOption[]
  accountOptions: AccountOption[]
}) {
  const { titulo, detalhe } = rotuloDaConta(item.conta, item.cardLastDigits)
  return (
    <li className="border-b border-gray-100 last:border-b-0">
      <div className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50" onClick={onAbrir}>
        <input
          type="checkbox"
          aria-label={`Marcar ${item.description}`}
          className="h-4 w-4 shrink-0 rounded border-gray-300 disabled:opacity-30"
          checked={marcado}
          disabled={!palpite.marcavel}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onMarcar(e.target.checked)}
        />
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
          <div className="flex min-w-0 items-baseline gap-3 sm:w-1/2">
            <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{item.description}</span>
            <span className="shrink-0 text-sm text-gray-500">{diaMes(item.date)}</span>
            <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums text-gray-900">{valorComSinal(item.amountCents)}</span>
          </div>
          <p className="min-w-0 truncate text-sm text-gray-600 sm:flex-1">{palpite.frase}</p>
        </div>
        <Button
          size="sm"
          variant={palpite.acao === 'escolher' ? 'outline' : 'primary'}
          className="shrink-0"
          onClick={(e) => { e.stopPropagation(); onPalpite() }}
        >
          {palpite.botao}
        </Button>
      </div>

      {aberto && (
        <div className="space-y-2 bg-gray-50 px-3 pb-3 pt-1">
          <p className="text-xs text-gray-500">{detalhe ? `${titulo} · ${detalhe}` : titulo}</p>
          {item.repetido ? (
            <CardRepetido repetido={item.repetido} ocupado={false} onDescartar={acoes.onDescartar} onNaoERepetido={acoes.onNaoERepetido} />
          ) : (
            <PainelDeDecisao
              item={item}
              decisao={decisao}
              onMudar={acoes.onMudar}
              categoryOptions={categoryOptions}
              accountOptions={accountOptions}
              ocupado={false}
              onVincular={acoes.onVincular}
              onLancar={acoes.onLancar}
              onNenhum={acoes.onNenhum}
            />
          )}
        </div>
      )}
    </li>
  )
}
