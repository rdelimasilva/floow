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
      {/* Colunas fixas no desktop: data, valor e palpite alinhados linha a linha. No
          celular, descrição/data/valor em cima e o palpite embaixo (`sm:contents`
          solta os blocos na grade). */}
      <div
        className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 hover:bg-gray-50 sm:grid-cols-[auto_minmax(0,1.3fr)_3rem_6.5rem_minmax(0,1fr)_6rem]"
        onClick={onAbrir}
      >
        <input
          type="checkbox"
          aria-label={`Marcar ${item.description}`}
          className="h-4 w-4 rounded border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
          checked={marcado}
          disabled={!palpite.marcavel}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onMarcar(e.target.checked)}
        />
        <div className="min-w-0 sm:contents">
          <div className="flex min-w-0 items-baseline gap-3 sm:contents">
            <span className="min-w-0 flex-1 truncate font-medium text-gray-900" title={item.description}>{item.description}</span>
            <span className="shrink-0 text-sm text-gray-500">{diaMes(item.date)}</span>
            <span className="shrink-0 text-right text-sm font-medium tabular-nums text-gray-900">{valorComSinal(item.amountCents)}</span>
          </div>
          {/* Repetido é decisão de dois lados: a alternativa ao "Descartar"
              fica à vista, não escondida no detalhe — descartar compra real
              tira do saldo dinheiro que saiu. Aberta, o card já traz os dois. */}
          {item.repetido && !aberto ? (
            <p className="min-w-0 truncate text-sm text-gray-600">
              <span title={palpite.frase}>{palpite.frase}</span>
              {' · '}
              <button
                type="button"
                className="font-medium text-gray-900 underline underline-offset-2 hover:text-gray-700"
                onClick={(e) => { e.stopPropagation(); acoes.onNaoERepetido() }}
              >
                São duas compras
              </button>
            </p>
          ) : (
            <p className="min-w-0 truncate text-sm text-gray-600" title={palpite.frase}>{palpite.frase}</p>
          )}
        </div>
        <Button
          size="sm"
          variant={palpite.acao === 'escolher' ? 'outline' : 'primary'}
          className="w-24 sm:w-full"
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
