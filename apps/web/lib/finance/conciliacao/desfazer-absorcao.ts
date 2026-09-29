import { and, eq, sql, type SQL } from 'drizzle-orm'
import { transactions, type getDb, type OrigemDaTransacao } from '@floow/db'
import { ehPernaPrevista } from '@/lib/openfinance/perna-prevista'

type Db = ReturnType<typeof getDb>

/** A provisória que pode ter sido absorvida por um extrato (`matched_transaction_id`). */
export interface ProvisoriaVinculada {
  origem?: OrigemDaTransacao | null
  aguardaExtrato?: boolean | null
  externalId: string | null
  matchedTransactionId: string | null
}

/**
 * Natureza do extrato pelo sinal do PRÓPRIO valor (não o da provisória, que na
 * `:transfer-par` antiga pode ter sido casada com tolerância). Débito é
 * despesa, crédito é receita — o ponto de partida de Classificar.
 */
export const TIPO_PELO_SINAL: SQL = sql`case when ${transactions.amountCents} < 0 then 'expense' else 'income' end`

export type DevolucaoDoExtrato =
  | { type: SQL; reviewState: 'pending'; transferAccountId: null }
  | { reviewState: 'pending' }

/**
 * O que o extrato perde quando o vínculo com a provisória que ele absorveu se
 * desfaz (desconciliar, desfazer o par da regra, excluir a provisória). O
 * inverso de `aplicarEfeitoDaAbsorcao`.
 *
 * Perna: o extrato deixa de ser transferência — volta a receita ou despesa
 * pelo sinal (`TIPO_PELO_SINAL`), sem conta de destino, pendente em
 * Classificar. `:transfer-par` antiga é reconhecida pelo sufixo mesmo sem
 * `origem` na leitura, e recebe a mesma devolução.
 *
 * Manual ou arquivo: volta a pendente de revisão mantendo a categoria. A
 * categoria e a descrição de antes da absorção não são guardadas (sem coluna
 * nova), então não há o que restaurar; o usuário revê a linha uma vez.
 *
 * Previsão de recorrência cumprida não mudou nada no extrato: `null`.
 */
export function devolucaoDoExtrato(p: ProvisoriaVinculada): DevolucaoDoExtrato | null {
  if (!p.matchedTransactionId) return null
  if (p.origem === 'perna' || ehPernaPrevista(p.externalId)) return { type: TIPO_PELO_SINAL, reviewState: 'pending', transferAccountId: null }
  if (p.aguardaExtrato) return { reviewState: 'pending' }
  return null
}

/**
 * Aplica `devolucaoDoExtrato` no extrato vinculado. Não solta o vínculo nem
 * mexe em saldo: quem chama apaga a provisória ou limpa o vínculo, e o
 * extrato sempre esteve no saldo. Devolve o id do extrato devolvido.
 */
export async function devolverExtratoAbsorvido(db: Db, orgId: string, p: ProvisoriaVinculada): Promise<string | null> {
  const devolucao = devolucaoDoExtrato(p)
  if (!devolucao || !p.matchedTransactionId) return null
  await db
    .update(transactions)
    .set(devolucao)
    .where(and(eq(transactions.id, p.matchedTransactionId), eq(transactions.orgId, orgId)))
  return p.matchedTransactionId
}
