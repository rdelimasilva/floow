'use server'

import { getDb, accounts, transactions } from '@floow/db'
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { getOrgId } from './queries'
import { revalidateSnapshotData, revalidateTransactionData } from './revalidate'
import { accountsTag, investmentsTag, invalidateTag } from '@/lib/cache-tags'

/**
 * Aplica no saldo o lancamento DO BANCO cuja data ja chegou.
 *
 * Aqui vivia `reconcileRecurringBalances`, que fazia isso para qualquer linha
 * pendente — inclusive a previsao de template. Duas consequencias: punha
 * estimativa dentro de `accounts.balance_cents`, e, ao virar
 * `balance_applied = true`, tirava a previsao da fila de casamento, porque
 * `criarPropostasDeConciliacao` so olha previsto aberto. Por isso a conciliacao
 * so funcionava quando o extrato vinha ADIANTADO: chegando no dia ou depois,
 * a previsao ja tinha saido da fila e os dois lancamentos contavam.
 *
 * O que sobrou e o caso legitimo. Lancamento agendado ou de data futura vindo
 * do Open Finance entra com `balance_applied = false` (`sync.ts:353`), e o
 * caminho de update do sync nao mexe nesse campo de proposito — ninguem mais
 * o aplicaria quando o dia chegasse.
 *
 * A previsao de template fica de fora por `recurring_template_id IS NULL`:
 * ela nunca entra no saldo por data nenhuma. Quem a resolve e o casamento com
 * o realizado, e quem soma e o realizado.
 */
export async function applyDueBankTransactions() {
  const orgId = await getOrgId()
  const db = getDb()

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  const filtro = and(
    eq(transactions.orgId, orgId),
    eq(transactions.balanceApplied, false),
    // Veio do banco, nao de template. Os dois, porque uma linha de template
    // nunca tem `external_id` e um lancamento do banco nunca tem template —
    // exigir os dois deixa a intencao explicita para quem ler o SQL.
    isNotNull(transactions.externalId),
    isNull(transactions.recurringTemplateId),
    // Agendado entra do sync com `is_ignored = true` e `balance_applied =
    // false` (`sync.ts:386`): visivel para o usuario, fora das somas. Aplicar
    // por data sem olhar esta coluna fazia dele o "gasto que ninguem fez" que
    // o proprio sync diz evitar — dentro do saldo, e escondido de todo
    // relatorio que filtra `is_ignored`. Quem tira um lancamento do ignorado e
    // `toggleIgnoreTransaction`, que so troca a marca de linha fora do saldo:
    // o valor entra por aqui, quando a data chegar.
    eq(transactions.isIgnored, false),
    sql`${transactions.date} <= ${todayStr}::date`,
  )

  // Curto-circuito: a esmagadora maioria das cargas nao tem nada pendente.
  const pending = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(filtro)
    .limit(1)

  if (pending.length === 0) return

  const pendingTxs = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(filtro)

  // Agrupa por conta e aplica em bloco, para nao emitir N updates.
  const deltaByAccount = new Map<string, number>()
  const txIds: string[] = []
  for (const tx of pendingTxs) {
    deltaByAccount.set(tx.accountId, (deltaByAccount.get(tx.accountId) ?? 0) + tx.amountCents)
    txIds.push(tx.id)
  }

  await db.transaction(async (dbTx) => {
    const deltas = Array.from(deltaByAccount.entries())
    if (deltas.length > 0) {
      const cases = sql.join(
        deltas.map(([accountId, delta]) => sql`WHEN ${accounts.id} = ${accountId} THEN ${delta}`),
        sql.raw(' '),
      )
      const ids = deltas.map(([accountId]) => accountId)

      await dbTx
        .update(accounts)
        .set({ balanceCents: sql`${accounts.balanceCents} + CASE ${cases} ELSE 0 END` })
        .where(inArray(accounts.id, ids))
    }

    await dbTx
      .update(transactions)
      .set({ balanceApplied: true })
      .where(inArray(transactions.id, txIds))
  })

  revalidateTransactionData(orgId)
  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)
  invalidateTag(investmentsTag(orgId))
}
