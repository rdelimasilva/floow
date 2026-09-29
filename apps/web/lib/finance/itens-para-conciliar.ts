import { cache } from 'react'
import { contarDuplicatasPendentes } from '@/lib/finance/duplicata-queries'
import { contarPropostasPendentes } from '@/lib/finance/forecast-match-queries'
import { contarLancamentosAClassificar } from '@/lib/openfinance/counterparty-queries'

export interface ItensParaConciliar {
  repetidos: number
  classificar: number
  confirmar: number
  total: number
}

/**
 * Quanto espera decisão na tela Conciliar, fila por fila e somado.
 *
 * Uma fonte só para a faixa e o botão de Transações e para o assistente de
 * conexão: se cada um somasse do seu jeito, o número do botão e o da faixa
 * poderiam discordar na mesma tela.
 *
 * Falha numa contagem vale 0 e não derruba as outras. É o mesmo "fail open"
 * da faixa: um aviso não pode custar a tela que ele existe para melhorar. Sem
 * usuário resolvido, as filas que precisam dele para o RLS (`withUserDbFor`)
 * contam zero.
 *
 * `cache` do React: a tela de Transações pergunta duas vezes no mesmo request
 * (faixa e botão), e as três consultas só precisam rodar uma vez.
 */
export const contarItensParaConciliar = cache(
  async (orgId: string, userId: string | null): Promise<ItensParaConciliar> => {
    const [repetidos, classificar, confirmar] = await Promise.all([
      userId === null ? 0 : contarDuplicatasPendentes(orgId, userId).catch(() => 0),
      contarLancamentosAClassificar(orgId).catch(() => 0),
      userId === null ? 0 : contarPropostasPendentes(orgId, userId).catch(() => 0),
    ])
    return { repetidos, classificar, confirmar, total: repetidos + classificar + confirmar }
  },
)
