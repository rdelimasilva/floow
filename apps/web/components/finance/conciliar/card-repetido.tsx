import { formatBRL } from '@floow/core-finance/src/balance'
import type { Repetido } from '@/lib/finance/conciliacao/fila'
import type { LadoDaDuplicata } from '@/lib/finance/duplicata-queries'
import { Button } from '@/components/ui/button'
import { diaMes } from './card-conta'

/** "19/09" no fuso do usuário: `importadoEm` é instante, não data. */
function diaDaChegada(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
}

/**
 * O porquê em uma frase. A prova que convence é a chegada: compra nova não
 * entra com data de semanas atrás, e o original já estava no floow desde lá.
 */
function explicacao({ outro, este, horasEntreEmissoes }: Repetido): string {
  const chegouAntes = diaDaChegada(outro.importadoEm)
  const chegouAgora = diaDaChegada(este.importadoEm)
  if (chegouAntes !== chegouAgora) {
    return `A compra de ${diaMes(este.date)} já estava aqui desde ${chegouAntes}. Em ${chegouAgora} o banco mandou de novo.`
  }
  return `O banco mandou este lançamento duas vezes, com ${Math.round(horasEntreEmissoes)}h de diferença.`
}

function Linha({ rotulo, lado, outro }: { rotulo: string; lado: LadoDaDuplicata; outro: LadoDaDuplicata }) {
  // Destaca só o que difere: igual em tudo é o próprio argumento do repetido.
  const difere = (campo: 'description' | 'categoria') => lado[campo] !== outro[campo]
  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-3 text-xs text-gray-500">{rotulo}<br />chegou {diaDaChegada(lado.importadoEm)}</td>
      <td className={`py-2 pr-3 ${difere('description') ? 'font-semibold text-amber-700' : 'text-gray-900'}`}>{lado.description}</td>
      <td className={`py-2 pr-3 ${difere('categoria') ? 'font-semibold text-amber-700' : 'text-gray-700'}`}>{lado.categoria ?? 'Sem categoria'}</td>
      <td className="py-2 text-right whitespace-nowrap text-gray-900">{diaMes(lado.date)} · {formatBRL(lado.amountCents)}</td>
    </tr>
  )
}

/** Coluna direita quando o banco mandou duas vezes (spec §2.3): decidir o repetido vem antes de classificar o que pode sumir. */
export function CardRepetido({ repetido, ocupado, onDescartar, onNaoERepetido, onPular }: {
  repetido: Repetido
  ocupado: boolean
  onDescartar: () => void
  onNaoERepetido: () => void
  onPular: () => void
}) {
  const { outro, este } = repetido
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Chegou duas vezes</p>
      <p className="text-sm text-gray-700">{explicacao(repetido)}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            <Linha rotulo="Já estava" lado={outro} outro={este} />
            <Linha rotulo="Cópia" lado={este} outro={outro} />
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={ocupado} onClick={onDescartar}>Descartar a cópia</Button>
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onNaoERepetido}>São duas compras</Button>
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onPular}>Pular</Button>
      </div>
    </div>
  )
}
