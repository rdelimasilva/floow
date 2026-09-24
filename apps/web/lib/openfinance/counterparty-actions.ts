'use server'

import { z } from 'zod'
import { and, eq, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'
import { getDb, orgs, counterparties, transactions, accounts } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { assertAccountOwnership } from '@/lib/finance/account-actions'
import { requireIdentity } from '@/lib/auth/session'
import { revalidateSnapshotData, revalidateTransactionData } from '@/lib/finance/revalidate'
import { accountsTag, invalidateTag, reviewGateTag } from '@/lib/cache-tags'
import { isOpenFinanceLinkedAccount, montarPernaDaTransferencia } from './transfer-leg'
import { acharPernaPrevistaAberta } from './perna-prevista-aberta'
import { condicaoForaDeParDeTransferenciaPendente, criarPropostasDeConciliacao } from '@/lib/finance/forecast-match-db'

/**
 * O usuário confirma a natureza e a categoria de uma contraparte, e a
 * confirmação vale para trás E para a frente: as transações pendentes hoje
 * reclassificam agora; a próxima sincronização casa pela mesma linha em
 * `counterparties` (ver `resolve-counterparty.ts`).
 *
 * Substitui `nature-actions.ts::createNatureRule`. A diferença estrutural: lá
 * o UPDATE de transações precisava de `transactionIds` explícitos vindos do
 * cliente, porque a chave era texto reconstruído. Aqui é `counterparty_id`
 * gravado desde a ingestão — chave estrangeira, não há texto para divergir.
 *
 * `exceptions` cobre o lançamento que foge do padrão do grupo (ex.: os dois
 * Pix de valor atípico no meio de 32 recorrentes) sem virar regra: só os
 * lançamentos listados saem com a natureza/categoria da exceção, e a
 * contraparte grava a natureza/categoria do grupo do mesmo jeito — a próxima
 * sincronização aplica o padrão, não a exceção pontual.
 *
 * Ver docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md
 */

const exceptionSchema = z
  .object({
    transactionId: z.string().uuid(),
    nature: z.enum(['income', 'expense', 'transfer']),
    categoryId: z.string().uuid().nullable(),
    transferAccountId: z.string().uuid().nullable(),
  })
  .refine(natureMatchesDestination, {
    message: 'Transferência exige a outra conta, sem categoria. Receita e despesa exigem categoria, sem conta.',
  })

const inputSchema = z
  .object({
    counterpartyId: z.string().uuid(),
    nature: z.enum(['income', 'expense', 'transfer']),
    categoryId: z.string().uuid().nullable(),
    transferAccountId: z.string().uuid().nullable(),
    exceptions: z.array(exceptionSchema).default([]),
  })
  .refine(natureMatchesDestination, {
    message: 'Transferência exige a outra conta, sem categoria. Receita e despesa exigem categoria, sem conta.',
  })

function natureMatchesDestination(v: { nature: string; categoryId: string | null; transferAccountId: string | null }) {
  if (v.nature === 'transfer') return v.categoryId === null && v.transferAccountId !== null
  return v.categoryId !== null && v.transferAccountId === null
}

// `z.input`, não `z.infer`: `exceptions` tem `.default([])`, então quem chama
// pode omitir — só depois do `.parse()` é que o array garantidamente existe.
export type ConfirmCounterpartyInput = z.input<typeof inputSchema>
export type ConfirmCounterpartyException = z.infer<typeof exceptionSchema>

// Mesmo padrão de `resolve-counterparty.ts`/`sync.ts`: `Db` é o tipo cheio
// de `getDb()`, e o `tx` de dentro de `db.transaction(async (tx) => ...)` é
// estruturalmente compatível — sem precisar de um tipo próprio pra ele.
type Db = ReturnType<typeof getDb>

/**
 * Lançamento pendente que já tem `transfer_group_id` já tem par. Não deveria
 * existir (pendente nasce sem grupo), mas foi o que `vincularAplicacoesOrfas`
 * produzia com aplicação Nível 1 pendente. Classificar em cima dele
 * sobrescreveria o grupo e criaria uma segunda perna — ou, como receita/
 * despesa, deixaria a perna já criada órfã. Nos dois casos, o dinheiro em
 * dobro. Fica de fora de toda escrita desta action.
 */
function semParJaCriado() {
  return isNull(transactions.transferGroupId)
}

/**
 * Aplica transferência a UM lançamento pendente: natureza, sem categoria,
 * com a conta de destino. Decide o fork do §4 da spec — segunda perna real
 * quando o destino é manual, perna prevista quando é Open Finance. Retorna 1
 * se aplicou, 0 se o lançamento não estava mais pendente (corrida, ou id que
 * não pertence a esta contraparte/org).
 *
 * `contasParaConciliar` acumula, por referência, as contas onde a conciliação
 * tem par para propor: a conta Open Finance que ganhou perna prevista, ou a
 * própria conta do lançamento quando a perna prevista do outro lado já o
 * esperava ali. `confirmCounterparty` propõe nelas depois que a transação
 * commitar.
 */
async function applyTransferSingle(
  tx: Db,
  orgId: string,
  input: { transactionId: string; counterpartyId: string; transferAccountId: string },
  contasParaConciliar: Set<string>,
): Promise<number> {
  const [source] = await tx
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
      date: transactions.date,
      externalId: transactions.externalId,
      balanceApplied: transactions.balanceApplied,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, input.transactionId),
        eq(transactions.orgId, orgId),
        eq(transactions.counterpartyId, input.counterpartyId),
        eq(transactions.reviewState, 'pending'),
        semParJaCriado(),
      ),
    )
    .limit(1)

  if (!source) return 0

  if (source.accountId === input.transferAccountId) {
    throw new Error('A conta da transferência não pode ser a mesma conta do lançamento.')
  }

  // Mesma cerca do fluxo manual (`lib/finance/account-actions.ts`): garante que a
  // conta de destino é desta org antes de qualquer escrita — sem isso um
  // `transferAccountId` de outra org gravaria linha e creditaria saldo
  // cross-tenant (ver docs/superpowers/specs/2026-09-07-counterparty-transfer-account-design.md §7).
  await assertAccountOwnership(tx, input.transferAccountId, orgId)

  const linked = await isOpenFinanceLinkedAccount(tx, orgId, input.transferAccountId)

  // OF↔OF: se o outro lado chegou antes e já criou a perna prevista aqui,
  // esta linha é a ponta que ela espera. Criar outra perna daria dois pares
  // para o mesmo dinheiro; fica confirmada sem grupo, e a conciliação desta
  // conta propõe o par com a previsão que já existe.
  if (linked) {
    const esperada = await acharPernaPrevistaAberta(tx, orgId, {
      contaDoLancamento: source.accountId,
      outraConta: input.transferAccountId,
      amountCents: source.amountCents,
      date: source.date,
    })
    if (esperada) {
      await tx
        .update(transactions)
        .set({
          type: 'transfer',
          categoryId: null,
          transferAccountId: input.transferAccountId,
          transferGroupId: null,
          reviewState: 'confirmed',
        })
        .where(eq(transactions.id, source.id))
      contasParaConciliar.add(source.accountId)
      return 1
    }
  }

  const transferGroupId = crypto.randomUUID()

  await tx
    .update(transactions)
    .set({
      type: 'transfer',
      categoryId: null,
      transferAccountId: input.transferAccountId,
      transferGroupId,
      reviewState: 'confirmed',
    })
    .where(eq(transactions.id, source.id))

  if (!source.externalId) {
    // Não deveria acontecer: só lançamento Open Finance chega pendente na
    // fila. Sem chave de dedupe, não se insere perna nenhuma.
    return 1
  }

  const perna = montarPernaDaTransferencia({
    source: { orgId, amountCents: source.amountCents, date: source.date, externalId: source.externalId, balanceApplied: source.balanceApplied },
    sourceAccountId: source.accountId,
    otherAccountId: input.transferAccountId,
    transferGroupId,
    destinoOpenFinance: linked,
  })

  // `.onConflictDoNothing().returning(...)` espelha o insert equivalente em
  // `sync.ts`: sem isso, uma colisão rara de unique constraint no
  // `externalId` derivado (`:transfer-dest`/`:transfer-par`) lançaria cru e
  // desfaria a transação inteira — inclusive o destravamento do portão de
  // revisão — em vez de degradar graciosamente como `sync.ts` já faz.
  const insertedLeg = await tx.insert(transactions).values(perna).onConflictDoNothing().returning({ id: transactions.id })

  // Só perna real e aplicada move o saldo. A prevista (destino Open Finance)
  // nasce com `balanceApplied: false`: o saldo de lá vem do extrato de lá.
  if (insertedLeg.length > 0 && perna.balanceApplied) {
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${-source.amountCents}` })
      .where(eq(accounts.id, input.transferAccountId))
  }

  if (linked) contasParaConciliar.add(input.transferAccountId)
  return 1
}

/** Mesma lógica de `applyTransferSingle`, para todos os lançamentos pendentes do grupo (menos as exceções). */
async function applyTransferBatch(
  tx: Db,
  orgId: string,
  input: { counterpartyId: string; transferAccountId: string; excludeIds: string[] },
  contasParaConciliar: Set<string>,
): Promise<number> {
  const conditions = [
    eq(transactions.orgId, orgId),
    eq(transactions.counterpartyId, input.counterpartyId),
    eq(transactions.reviewState, 'pending'),
    semParJaCriado(),
    // A ponta com proposta pendente contra perna prevista está escondida de
    // Classificar (a decisão dela é em Confirmar previsões). O lote não pode
    // alcançá-la por trás da tela.
    condicaoForaDeParDeTransferenciaPendente(),
  ]
  if (input.excludeIds.length > 0) conditions.push(notInArray(transactions.id, input.excludeIds))

  const pending = await tx.select({ id: transactions.id }).from(transactions).where(and(...conditions))

  let count = 0
  for (const row of pending) {
    count += await applyTransferSingle(
      tx,
      orgId,
      {
        transactionId: row.id,
        counterpartyId: input.counterpartyId,
        transferAccountId: input.transferAccountId,
      },
      contasParaConciliar,
    )
  }
  return count
}

export async function confirmCounterparty(raw: ConfirmCounterpartyInput): Promise<{ reclassified: number }> {
  const input = inputSchema.parse(raw)
  const orgId = await getOrgId()
  const db = getDb()

  const { userId } = await requireIdentity()

  const contasParaConciliar = new Set<string>()

  const reclassified = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: counterparties.id })
      .from(counterparties)
      .where(and(eq(counterparties.id, input.counterpartyId), eq(counterparties.orgId, orgId)))
      .limit(1)

    if (!row) throw new Error('Contraparte não encontrada.')

    if (input.nature === 'transfer') {
      // Valida a posse da conta de destino incondicionalmente, ANTES de
      // gravar `counterparties.transferAccountId` — não só dentro de
      // `applyTransferSingle`. Sem isso, quando a fila de pendentes desta
      // contraparte já está vazia (ou toda coberta por exceção), o loop de
      // `applyTransferBatch` nunca roda, `applyTransferSingle` nunca roda, e
      // um `transferAccountId` de outra org commitaria em `counterparties`
      // sem nunca ter sido checado — campo que uma sincronização futura lê
      // pra aplicar a regra automaticamente (ver task-3-report.md, achado da
      // revisão: rodada 2). A checagem dentro de `applyTransferSingle`
      // continua ali, redundante mas inofensiva, cobrindo o batch/exceções.
      await assertAccountOwnership(tx as unknown as Db, input.transferAccountId!, orgId)
    }

    await tx
      .update(counterparties)
      .set({
        nature: input.nature,
        categoryId: input.categoryId,
        transferAccountId: input.transferAccountId,
        confirmedAt: new Date(),
        confirmedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(counterparties.id, input.counterpartyId), eq(counterparties.orgId, orgId)))

    const exceptionIds = input.exceptions.map((e) => e.transactionId)
    let reclassifiedCount = 0

    if (input.nature === 'transfer') {
      // Mesmo cast de `assertAccountOwnership(tx as unknown as Db, ...)` em
      // `lib/finance/account-actions.ts`: o `tx` de dentro do callback não é
      // diretamente atribuível ao tipo cheio de `getDb()`.
      reclassifiedCount += await applyTransferBatch(
        tx as unknown as Db,
        orgId,
        {
          counterpartyId: input.counterpartyId,
          transferAccountId: input.transferAccountId!,
          excludeIds: exceptionIds,
        },
        contasParaConciliar,
      )
    } else {
      const batchConditions = [
        eq(transactions.orgId, orgId),
        eq(transactions.counterpartyId, input.counterpartyId),
        eq(transactions.reviewState, 'pending'),
        semParJaCriado(),
        // Mesmo motivo do lote de transferência: o que a tela esconde, o lote
        // não reclassifica.
        condicaoForaDeParDeTransferenciaPendente(),
      ]
      if (exceptionIds.length > 0) batchConditions.push(notInArray(transactions.id, exceptionIds))

      const rows = await tx
        .update(transactions)
        .set({ type: input.nature, categoryId: input.categoryId, transferAccountId: null, reviewState: 'confirmed' })
        .where(and(...batchConditions))
        .returning({ id: transactions.id })
      reclassifiedCount += rows.length
    }

    for (const exception of input.exceptions) {
      if (exception.nature === 'transfer') {
        reclassifiedCount += await applyTransferSingle(
          tx as unknown as Db,
          orgId,
          {
            transactionId: exception.transactionId,
            counterpartyId: input.counterpartyId,
            transferAccountId: exception.transferAccountId!,
          },
          contasParaConciliar,
        )
      } else {
        const exceptionRows = await tx
          .update(transactions)
          .set({ type: exception.nature, categoryId: exception.categoryId, transferAccountId: null, reviewState: 'confirmed' })
          .where(
            and(
              eq(transactions.orgId, orgId),
              eq(transactions.counterpartyId, input.counterpartyId),
              eq(transactions.reviewState, 'pending'),
              eq(transactions.id, exception.transactionId),
              semParJaCriado(),
            ),
          )
          .returning({ id: transactions.id })
        reclassifiedCount += exceptionRows.length
      }
    }

    // Se esta foi a última pendência resolvível da org, destrava o portão
    // para sempre. Movido de getReviewGateStatus (achado da revisão final):
    // gravar como efeito de leitura destravava orgs sem fila nenhuma antes
    // do bootstrap sequer existir — agora só grava quando uma confirmação
    // de verdade zera a fila.
    const [stillPending] = await tx
      .select({ one: sql`1` })
      .from(transactions)
      .where(
        and(
          eq(transactions.orgId, orgId),
          eq(transactions.reviewState, 'pending'),
          isNotNull(transactions.counterpartyId),
          // Ponta com par de transferência pendente decide-se em Confirmar previsões.
          condicaoForaDeParDeTransferenciaPendente(),
        ),
      )
      .limit(1)

    if (!stillPending) {
      await tx
        .update(orgs)
        .set({ reviewGateClearedAt: sql`coalesce(${orgs.reviewGateClearedAt}, now())` })
        .where(eq(orgs.id, orgId))
    }

    return reclassifiedCount
  })

  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)
  // O layout guarda em cache se o portão já destravou; esta action é o único
  // lugar que o destrava.
  invalidateTag(reviewGateTag(orgId))

  // A ponta real pode já estar na outra conta: propõe o par agora, sem
  // esperar o próximo sync dela. Falha aqui não desfaz a confirmação — a
  // proposta nasce de novo na próxima passada daquela conta.
  for (const conta of contasParaConciliar) {
    try {
      await criarPropostasDeConciliacao(db, orgId, conta)
    } catch (error) {
      console.error('[confirmCounterparty] falha ao propor conciliacao da perna prevista:', error)
    }
  }

  // Depois das propostas, não antes: a lista de lançamentos e as filas leem
  // as propostas; invalidar antes serviria a tela sem o par recém-proposto.
  revalidateTransactionData(orgId)

  return { reclassified }
}
