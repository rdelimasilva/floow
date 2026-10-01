import { cache } from 'react'
import { contarFila } from '@/lib/finance/conciliacao/fila-db'

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
 * `total` é de lançamentos distintos na fila do modo foco (spec 2026-10-01
 * §3.3). Falha na contagem vale 0 — mesmo "fail open" de antes: um aviso não
 * pode custar a tela que ele existe para melhorar. Sem usuário resolvido
 * (RLS exige `userId` via `withUserDbFor`), conta zero.
 *
 * `cache` do React: a tela de Transações pergunta duas vezes no mesmo request
 * (faixa e botão), e a consulta só precisa rodar uma vez.
 */
const ZERO: ItensParaConciliar = { repetidos: 0, classificar: 0, confirmar: 0, total: 0 }
export const contarItensParaConciliar = cache(
  async (orgId: string, userId: string | null): Promise<ItensParaConciliar> =>
    userId === null ? ZERO : contarFila(orgId, userId).catch(() => ZERO),
)
