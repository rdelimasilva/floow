import { z } from 'zod'
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm'
import { getDb, transactions, accounts } from '@floow/db'
import { assertAccountOwnership } from '@/lib/finance/account-actions'
import { isOpenFinanceLinkedAccount, montarPernaDaTransferencia } from './transfer-leg'
import { acharPernaPrevistaAberta } from './perna-prevista-aberta'
import { condicaoForaDeParDeTransferenciaPendente } from '@/lib/finance/forecast-match-db'
import { ehCpfProprio, carregarHashesDoTitular } from './cpf-proprio'

// Mesmo padrão de `resolve-counterparty.ts`/`sync.ts`: `Db` é o tipo cheio
// de `getDb()`, e o `tx` de dentro de `db.transaction(async (tx) => ...)` é
// estruturalmente compatível — sem precisar de um tipo próprio pra ele.
type Db = ReturnType<typeof getDb>

export const exceptionSchema = z
  .object({
    transactionId: z.string().uuid(),
    nature: z.enum(['income', 'expense', 'transfer']),
    categoryId: z.string().uuid().nullable(),
    transferAccountId: z.string().uuid().nullable(),
  })
  .refine(natureMatchesDestination, {
    message: 'Transferência exige a outra conta, sem categoria. Receita e despesa exigem categoria, sem conta.',
  })

function natureMatchesDestination(v: { nature: string; categoryId: string | null; transferAccountId: string | null }) {
  if (v.nature === 'transfer') return v.categoryId === null && v.transferAccountId !== null
  return v.categoryId !== null && v.transferAccountId === null
}

export type ConfirmCounterpartyException = z.infer<typeof exceptionSchema>

/**
 * Lançamento pendente que já tem `transfer_group_id` já tem par. Não deveria
 * existir (pendente nasce sem grupo), mas foi o que `vincularAplicacoesOrfas`
 * produzia com aplicação Nível 1 pendente. Classificar em cima dele
 * sobrescreveria o grupo e criaria uma segunda perna — ou, como receita/
 * despesa, deixaria a perna já criada órfã. Nos dois casos, o dinheiro em
 * dobro. Fica de fora de toda escrita desta action.
 */
export function semParJaCriado() {
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
export async function applyTransferSingle(
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
export async function applyTransferBatch(
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

export interface DecisaoDaRegra {
  counterpartyId: string
  nature: 'income' | 'expense' | 'transfer'
  categoryId: string | null
  transferAccountId: string | null
  exceptions: ConfirmCounterpartyException[]
}

const MSG_DESTINO = 'Transferência exige a outra conta, sem categoria. Receita e despesa exigem categoria, sem conta.'

/**
 * A conta que a contraparte grava. Pix para o próprio CPF vai cada vez para
 * uma conta, então a regra dele não grava nenhuma: `resolveCounterparty` já
 * devolve a `pending` a transferência confirmada sem conta, e cada lançamento
 * novo é decidido em Classificar (spec §6.2).
 */
export function contaQueARegraGrava(v: { nature: string; transferAccountId: string | null; cpfProprio: boolean }): string | null {
  if (v.nature !== 'transfer') return null
  if (v.cpfProprio) return null
  if (!v.transferAccountId) throw new Error(MSG_DESTINO)
  return v.transferAccountId
}

export async function ehRegraDoTitular(
  tx: Pick<Db, 'select'>,
  orgId: string,
  regra: { keyType: string; keyValue: string },
): Promise<boolean> {
  if (regra.keyType !== 'tax_id') return false
  return ehCpfProprio(regra.keyValue, await carregarHashesDoTitular(tx, orgId))
}

/**
 * Aplica a decisão aos lançamentos PENDENTES da contraparte: o lote (menos as
 * exceções) e cada exceção. Era o corpo de `confirmCounterparty`; saiu para
 * cá para `corrigirRegra` reaplicar dentro da mesma transação em que desfez.
 *
 * Transferência sem conta (CPF próprio) não tem lote: só as exceções, cada
 * uma com a sua conta, são aplicadas. O resto continua pendente.
 */
export async function aplicarDecisaoAosPendentes(
  tx: Db,
  orgId: string,
  decisao: DecisaoDaRegra,
  contasParaConciliar: Set<string>,
): Promise<number> {
  const exceptionIds = decisao.exceptions.map((e) => e.transactionId)
  let reclassifiedCount = 0

  if (decisao.nature === 'transfer') {
    // Mesmo cast de `assertAccountOwnership(tx as unknown as Db, ...)` em
    // `lib/finance/account-actions.ts`: o `tx` de dentro do callback não é
    // diretamente atribuível ao tipo cheio de `getDb()`.
    if (decisao.transferAccountId) {
      reclassifiedCount += await applyTransferBatch(
        tx,
        orgId,
        {
          counterpartyId: decisao.counterpartyId,
          transferAccountId: decisao.transferAccountId,
          excludeIds: exceptionIds,
        },
        contasParaConciliar,
      )
    }
  } else {
    const batchConditions = [
      eq(transactions.orgId, orgId),
      eq(transactions.counterpartyId, decisao.counterpartyId),
      eq(transactions.reviewState, 'pending'),
      semParJaCriado(),
      // Mesmo motivo do lote de transferência: o que a tela esconde, o lote
      // não reclassifica.
      condicaoForaDeParDeTransferenciaPendente(),
    ]
    if (exceptionIds.length > 0) batchConditions.push(notInArray(transactions.id, exceptionIds))

    const rows = await tx
      .update(transactions)
      .set({ type: decisao.nature, categoryId: decisao.categoryId, transferAccountId: null, reviewState: 'confirmed' })
      .where(and(...batchConditions))
      .returning({ id: transactions.id })
    reclassifiedCount += rows.length
  }

  for (const exception of decisao.exceptions) {
    if (exception.nature === 'transfer') {
      reclassifiedCount += await applyTransferSingle(
        tx,
        orgId,
        {
          transactionId: exception.transactionId,
          counterpartyId: decisao.counterpartyId,
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
            eq(transactions.counterpartyId, decisao.counterpartyId),
            eq(transactions.reviewState, 'pending'),
            eq(transactions.id, exception.transactionId),
            semParJaCriado(),
          ),
        )
        .returning({ id: transactions.id })
      reclassifiedCount += exceptionRows.length
    }
  }

  return reclassifiedCount
}
