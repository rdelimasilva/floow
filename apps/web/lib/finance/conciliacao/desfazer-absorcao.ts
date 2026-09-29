import { and, eq } from 'drizzle-orm'
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

export type DevolucaoDoExtrato = { reviewState: 'pending'; transferAccountId: null } | { reviewState: 'pending' }

/**
 * O que o extrato perde quando o vínculo com a provisória que ele absorveu se
 * desfaz (desconciliar, desfazer o par da regra, excluir a provisória). O
 * inverso de `aplicarEfeitoDaAbsorcao`.
 *
 * Perna: o extrato volta a Classificar como transferência sem conta — o que o
 * desfazer da `:transfer-par` já fazia. `:transfer-par` antiga é reconhecida
 * pelo sufixo mesmo sem `origem` na leitura.
 *
 * Manual ou arquivo: volta a pendente de revisão mantendo a categoria. A
 * categoria e a descrição de antes da absorção não são guardadas (sem coluna
 * nova), então não há o que restaurar; o usuário revê a linha uma vez.
 *
 * Previsão de recorrência cumprida não mudou nada no extrato: `null`.
 */
export function devolucaoDoExtrato(p: ProvisoriaVinculada): DevolucaoDoExtrato | null {
  if (!p.matchedTransactionId) return null
  if (p.origem === 'perna' || ehPernaPrevista(p.externalId)) return { reviewState: 'pending', transferAccountId: null }
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
