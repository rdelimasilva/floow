import { and, eq, isNull, ne } from 'drizzle-orm'
import { transactions, type getDb, type OrigemDaTransacao } from '@floow/db'
import { efeitoDaAbsorcao, type ParConciliado } from '@floow/core-finance'
import { condicaoDaTransacaoDaOrg } from '@/lib/finance/forecast-match-db'

type Db = ReturnType<typeof getDb>

export interface ProvisoriaAbsorvida {
  id: string
  origem: OrigemDaTransacao
  categoryId: string | null
  description: string
  transferAccountId: string | null
  transferGroupId: string | null
}

const colunasDaProvisoria = {
  id: transactions.id,
  origem: transactions.origem,
  categoryId: transactions.categoryId,
  description: transactions.description,
  transferAccountId: transactions.transferAccountId,
  transferGroupId: transactions.transferGroupId,
}

/**
 * A outra conta da transferência. A perna que aguarda uma conta OF
 * (`:transfer-par`) guarda a origem em `transfer_account_id`; a
 * `:transfer-dest` e a perna manual, não — a origem é a outra linha do grupo.
 */
async function outraContaDaPerna(db: Db, orgId: string, p: ProvisoriaAbsorvida): Promise<string | null> {
  if (p.transferAccountId) return p.transferAccountId
  if (!p.transferGroupId) return null
  const [outra] = await db
    .select({ accountId: transactions.accountId })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.transferGroupId, p.transferGroupId),
        ne(transactions.id, p.id),
      ),
    )
    .limit(1)
  return outra?.accountId ?? null
}

/**
 * O que a linha do extrato ganha ao absorver a provisória (regra em
 * `efeitoDaAbsorcao`). Usado pelo motor (R1) e por `aprovarProposta`, para
 * que decidir na fila e absorver sozinho deem o mesmo resultado. No espelho
 * OF↔OF (extrato já em outro grupo) não ganha nada: só o vínculo. Devolve se
 * aplicou efeito; todo efeito confirma o extrato (`reviewState: 'confirmed'`).
 */
export async function aplicarEfeitoDaAbsorcao(
  db: Db,
  orgId: string,
  provisoria: ProvisoriaAbsorvida,
  extratoId: string,
): Promise<boolean> {
  const [extrato] = await db
    .select({
      reviewState: transactions.reviewState,
      categoryId: transactions.categoryId,
      isAutoCategorized: transactions.isAutoCategorized,
      transferGroupId: transactions.transferGroupId,
    })
    .from(transactions)
    .where(condicaoDaTransacaoDaOrg(extratoId, orgId))
    .limit(1)
  if (!extrato) return false

  const outraConta = provisoria.origem === 'perna' ? await outraContaDaPerna(db, orgId, provisoria) : null
  const efeito = efeitoDaAbsorcao(provisoria, extrato, outraConta)
  if (!efeito) return false
  await db.update(transactions).set(efeito).where(condicaoDaTransacaoDaOrg(extratoId, orgId))
  return true
}

/**
 * Grava o vínculo provisória → extrato (o mesmo `matched_transaction_id` de
 * hoje, que `desconciliar` já desfaz) e aplica o efeito no extrato.
 *
 * UPDATE condicional: se outro caminho vinculou a provisória antes (a
 * aprovação na fila, um sync que furou o lock), não pega nada e devolve
 * `false` — nada muda no extrato. Não mexe em saldo: a provisória nunca
 * esteve nele, e o extrato já está.
 */
export async function absorverNoBanco(db: Db, orgId: string, par: ParConciliado): Promise<boolean> {
  const [provisoria] = await db
    .update(transactions)
    .set({ matchedTransactionId: par.extratoId })
    .where(
      and(
        eq(transactions.id, par.aguardandoId),
        eq(transactions.orgId, orgId),
        eq(transactions.aguardaExtrato, true),
        isNull(transactions.matchedTransactionId),
      ),
    )
    .returning(colunasDaProvisoria)

  if (!provisoria) return false
  await aplicarEfeitoDaAbsorcao(db, orgId, provisoria, par.extratoId)
  return true
}
