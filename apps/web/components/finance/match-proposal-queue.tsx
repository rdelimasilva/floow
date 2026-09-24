'use client'

import { useState } from 'react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { aprovarProposta, recusarProposta } from '@/lib/finance/forecast-match-actions'
import type { PropostaPendente } from '@/lib/finance/forecast-match-queries'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * A fila mostra os dois lados e o porquê do par.
 *
 * `matchForecast` aceita até 7 dias de janela e 8% de diferença de valor
 * quando há palavra em comum na descrição — então o par plausível e o par
 * errado chegam parecidos na tela. Sem dizer quantos dias e quanto de valor
 * separam os dois, "é o mesmo?" é pergunta sem informação.
 *
 * Sem "aprovar todas": a decisão é par por par por desenho, e um botão de
 * varredura devolveria o problema que este gate existe para resolver.
 */
export function MatchProposalQueue({ propostas: iniciais }: { propostas: PropostaPendente[] }) {
  const { toast } = useToast()
  const [propostas, setPropostas] = useState(iniciais)
  const [decidindo, setDecidindo] = useState<string | null>(null)

  /**
   * A action devolve `false` por mais de um motivo: a proposta não está mais
   * pendente (duas abas, dois cliques) ou uma ponta do par ficou inelegível na
   * janela entre propor e aprovar — o realizado marcado como ignorado, a
   * previsão que ganhou vínculo por outro caminho.
   *
   * Não é erro, mas também não é o que o clique pediu: se o toast dissesse
   * "Conciliado" ou "Marcados como diferentes" sem checar o retorno, mentiria
   * sobre qual decisão realmente valeu. O cartão sai da tela nos dois casos —
   * a linha já está velha de qualquer jeito — mas a mensagem muda.
   *
   * A mensagem é genérica de propósito: ela cobre os dois motivos sem afirmar
   * qual foi. "Decidida em outra aba" mentiria quando o motivo foi a ponta
   * inelegível, e distinguir os dois pediria um terceiro caminho de código para
   * uma diferença que não muda o que o usuário faz em seguida: reler a fila.
   */
  async function decidir(proposta: PropostaPendente, eOMesmo: boolean) {
    setDecidindo(proposta.id)
    try {
      const decidiuAgora = eOMesmo
        ? (await aprovarProposta(proposta.id)).efetivada
        : (await recusarProposta(proposta.id)).recusada

      setPropostas((prev) => prev.filter((p) => p.id !== proposta.id))

      if (decidiuAgora) {
        toast(eOMesmo ? 'Conciliado' : 'Marcados como lançamentos diferentes')
      } else {
        toast('Esta previsão não está mais válida. A fila foi atualizada.', 'info')
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível decidir', 'error')
    } finally {
      setDecidindo(null)
    }
  }

  if (propostas.length === 0) {
    return <p className="text-sm text-gray-600">Nenhuma previsão esperando confirmação.</p>
  }

  const dia = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

  return (
    <ul className="space-y-3">
      {propostas.map((proposta) => (
        <li
          key={proposta.id}
          data-testid={`proposta-${proposta.id}`}
          className="rounded-lg border border-gray-200 p-4"
        >
          <div className="grid gap-1 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-gray-500">previsto · {dia(proposta.previsao.date)}</span>
              <span className="font-medium text-gray-900">{proposta.previsao.description}</span>
              <span className="shrink-0 font-semibold text-gray-900">
                {formatBRL(proposta.previsao.amountCents)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-gray-500">banco · {dia(proposta.realizado.date)}</span>
              <span className="font-medium text-gray-900">{proposta.realizado.description}</span>
              <span className="shrink-0 font-semibold text-gray-900">
                {formatBRL(proposta.realizado.amountCents)}
              </span>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {proposta.contaNome && (
              <>
                <span>{proposta.contaNome}</span>
                {' · '}
              </>
            )}
            {proposta.diasDeDiferenca === 0
              ? 'mesmo dia'
              : `${proposta.diasDeDiferenca} dia${proposta.diasDeDiferenca > 1 ? 's' : ''} de diferença`}
            {' · '}
            {proposta.diferencaCents === 0
              ? 'mesmo valor'
              : `${formatBRL(proposta.diferencaCents)} de diferença`}
          </p>

          <div className="mt-3 flex gap-2">
            <Button type="button" disabled={decidindo !== null} onClick={() => decidir(proposta, true)}>
              É o mesmo
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={decidindo !== null}
              onClick={() => decidir(proposta, false)}
            >
              São diferentes
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
