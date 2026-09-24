import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { getDb, transactions } from '@floow/db'
import { condicaoDeRealizadoSemVinculo, criarPropostasDeConciliacao } from '@/lib/finance/forecast-match-db'
import { buildForecastTransferLegRow, isOpenFinanceLinkedAccount } from './transfer-leg'
import { condicaoNaoEPernaPrevista } from './perna-prevista'
import { acharPernaPrevistaAberta } from './perna-prevista-aberta'

type Db = ReturnType<typeof getDb>

/**
 * Transferências confirmadas entre 07/09 e a spec de 24/09 com destino Open
 * Finance: só gravaram `transfer_account_id`, sem perna. Cria a perna prevista
 * de cada uma e propõe a conciliação na conta de destino — daí em diante, é o
 * mesmo caminho de uma transferência nova.
 *
 * Roda junto do backfill (`/api/admin/backfill-counterparties`), uma vez.
 * Idempotente: quem ganhou perna ganhou `transfer_group_id` e sai do filtro.
 */
export async function criarPernasPrevistasFaltantes(db: Db, orgId: string): Promise<{ criadas: number }> {
  const semPar = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
      date: transactions.date,
      externalId: transactions.externalId,
      transferAccountId: transactions.transferAccountId,
      balanceApplied: transactions.balanceApplied,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.type, 'transfer'),
        eq(transactions.reviewState, 'confirmed'),
        isNotNull(transactions.transferAccountId),
        isNull(transactions.transferGroupId),
        isNotNull(transactions.externalId),
        condicaoNaoEPernaPrevista(),
        // A ponta real que `aprovarProposta` converteu também fica assim —
        // transferência confirmada, com conta, sem grupo. Ela já tem par (a
        // perna prevista que aponta para ela); ganhar outra seria o mesmo
        // dinheiro esperado duas vezes.
        condicaoDeRealizadoSemVinculo(),
      ),
    )

  // Contas onde há par a propor: o destino que ganhou perna prevista, ou a
  // conta da linha quando a perna do outro lado já a esperava ali.
  const contas = new Set<string>()
  let criadas = 0

  for (const linha of semPar) {
    const destino = linha.transferAccountId!
    if (!(await isOpenFinanceLinkedAccount(db, orgId, destino))) continue

    // OF↔OF: se o outro lado já criou a perna prevista nesta conta (nesta
    // mesma passada, inclusive), esta linha é a ponta que ela espera — criar
    // outra daria dois pares para o mesmo dinheiro.
    const esperada = await acharPernaPrevistaAberta(db, orgId, {
      contaDoLancamento: linha.accountId,
      outraConta: destino,
      amountCents: linha.amountCents,
      date: new Date(linha.date),
    })
    if (esperada) {
      contas.add(linha.accountId)
      continue
    }

    const transferGroupId = crypto.randomUUID()
    await db.transaction(async (tx) => {
      await tx.update(transactions).set({ transferGroupId }).where(and(eq(transactions.id, linha.id), eq(transactions.orgId, orgId)))
      await tx
        .insert(transactions)
        .values(
          buildForecastTransferLegRow(
            { orgId, amountCents: linha.amountCents, date: linha.date, externalId: linha.externalId!, balanceApplied: false },
            linha.accountId,
            destino,
            transferGroupId,
          ),
        )
        .onConflictDoNothing()
    })
    contas.add(destino)
    criadas++
  }

  for (const conta of contas) await criarPropostasDeConciliacao(db, orgId, conta)

  return { criadas }
}
