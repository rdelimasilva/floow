'use server'

import { getDb, accounts, transactions, duplicateProposals } from '@floow/db'
import { and, eq, sql } from 'drizzle-orm'
import { getOrgId } from './queries'
import { revalidateAccountData, revalidateSnapshotData, revalidateTransactionData } from './revalidate'

/**
 * Efetiva a proposta: o lançamento reemitido pela fonte sai das somas.
 *
 * Marca `is_ignored` em vez de apagar. `is_ignored` já significa "este
 * lançamento é errado, não existe" no schema — tira de orçamentos, dívidas e
 * CFO — e, diferente do delete, deixa a decisão reversível e preserva o rastro
 * do que a fonte mandou. Quem descobrir depois que eram dois pagamentos de
 * verdade desfaz num clique.
 *
 * O estorno só vale para o que ENTROU no saldo: um agendado do Open Finance
 * entra com `balance_applied = false` e nunca foi somado, então revertê-lo
 * devolveria dinheiro que ninguém debitou.
 *
 * Devolve `efetivada: false` quando a proposta já não está pendente ou quando
 * a duplicata já foi ignorada por outro caminho — dois cliques, duas abas, ou
 * o usuário ignorando na mão antes de aprovar. Nenhum é erro; sem essa
 * reconferência o saldo seria estornado duas vezes.
 */
export async function aprovarDuplicata(propostaId: string): Promise<{ efetivada: boolean }> {
  const orgId = await getOrgId()
  const db = getDb()

  const efetivada = await db.transaction(async (tx) => {
    const [proposta] = await tx
      .select({
        id: duplicateProposals.id,
        duplicataTransactionId: duplicateProposals.duplicataTransactionId,
      })
      .from(duplicateProposals)
      .where(
        and(
          eq(duplicateProposals.id, propostaId),
          eq(duplicateProposals.orgId, orgId),
          eq(duplicateProposals.status, 'pending'),
        ),
      )
      .limit(1)

    if (!proposta) return false

    // A janela entre propor e aprovar é aberta por desenho — a fila não
    // bloqueia o app — e nela o usuário mexe no lançamento.
    const [duplicata] = await tx
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        amountCents: transactions.amountCents,
        balanceApplied: transactions.balanceApplied,
        isIgnored: transactions.isIgnored,
      })
      .from(transactions)
      .where(and(eq(transactions.id, proposta.duplicataTransactionId), eq(transactions.orgId, orgId)))
      .limit(1)

    if (!duplicata || duplicata.isIgnored) return false

    await tx
      .update(transactions)
      .set({ isIgnored: true })
      .where(and(eq(transactions.id, duplicata.id), eq(transactions.orgId, orgId)))

    if (duplicata.balanceApplied) {
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${-duplicata.amountCents}` })
        .where(and(eq(accounts.id, duplicata.accountId), eq(accounts.orgId, orgId)))
    }

    await tx
      .update(duplicateProposals)
      .set({ status: 'approved', decidedAt: new Date() })
      .where(and(eq(duplicateProposals.id, propostaId), eq(duplicateProposals.orgId, orgId)))

    return true
  })

  if (efetivada) {
    revalidateTransactionData(orgId)
    revalidateAccountData(orgId)
    revalidateSnapshotData(orgId)
  }

  return { efetivada }
}

/**
 * Recusa a proposta: os dois lançamentos são reais.
 *
 * Não toca em lançamento nenhum — só fecha a proposta. A recusa é definitiva
 * para aquele par: `uq_dp_par` mais o `onConflictDoNothing` do criador fazem
 * dela uma parede, senão duas compras iguais no mesmo dia voltariam à fila a
 * cada sincronização.
 */
export async function recusarDuplicata(propostaId: string): Promise<{ recusada: boolean }> {
  const orgId = await getOrgId()
  const db = getDb()

  const atualizada = await db
    .update(duplicateProposals)
    .set({ status: 'refused', decidedAt: new Date() })
    .where(
      and(
        eq(duplicateProposals.id, propostaId),
        eq(duplicateProposals.orgId, orgId),
        eq(duplicateProposals.status, 'pending'),
      ),
    )
    .returning({ id: duplicateProposals.id })

  if (atualizada.length > 0) revalidateTransactionData(orgId)

  return { recusada: atualizada.length > 0 }
}
