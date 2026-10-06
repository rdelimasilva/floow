import type { ItemDaFila } from '@/lib/finance/conciliacao/fila'
import type { Candidata } from '@/lib/finance/conciliacao/candidatos'
import { Button } from '@/components/ui/button'
import { ListaDeCandidatas } from './card-candidatos'
import { CardClassificar, type AccountOption, type CategoryOption, type Decisao } from './card-classificar'
import { ProcurarPrevisao } from './procurar-previsao'

/**
 * Coluna direita do card (card v2 §C): tudo que se decide sobre o lançamento
 * visível de uma vez — previsões parecidas, busca e lançar como novo.
 */
export function PainelDeDecisao({
  item, decisao, onMudar, categoryOptions, accountOptions, ocupado, onVincular, onLancar, onNenhum, onPular,
}: {
  item: ItemDaFila
  decisao: Decisao | null
  onMudar: (d: Decisao) => void
  categoryOptions: CategoryOption[]
  accountOptions: AccountOption[]
  ocupado: boolean
  onVincular: (c: Candidata) => void
  onLancar: () => void
  onNenhum: () => void
  onPular: () => void
}) {
  const temCandidatas = item.candidatas.length > 0
  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <ListaDeCandidatas candidatas={item.candidatas} ocupado={ocupado} onVincular={onVincular} />
      <ProcurarPrevisao key={item.id} realizadoId={item.id} ocupado={ocupado} onVincular={onVincular} />
      {item.classificacao && decisao && (
        <div className="border-t border-gray-100 pt-4">
          <CardClassificar
            classificacao={item.classificacao}
            amountCents={item.amountCents}
            contaDoItemId={item.conta.id}
            decisao={decisao}
            onMudar={onMudar}
            categoryOptions={categoryOptions}
            accountOptions={accountOptions}
            ocupado={ocupado}
            alternativa={temCandidatas}
            onConfirmar={onLancar}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!item.classificacao && temCandidatas && (
          <Button variant="outline" size="sm" disabled={ocupado} onClick={onNenhum}>Não é nenhum</Button>
        )}
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onPular}>Pular</Button>
      </div>
    </div>
  )
}
