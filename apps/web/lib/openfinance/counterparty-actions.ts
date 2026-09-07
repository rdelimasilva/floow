'use server'

import { z } from 'zod'
import { and, eq, isNotNull, notInArray, sql } from 'drizzle-orm'
import { getDb, orgs, counterparties, transactions } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { createClient } from '@/lib/supabase/server'
import { revalidateSnapshotData, revalidateTransactionData } from '@/lib/finance/revalidate'
import { accountsTag, invalidateTag } from '@/lib/cache-tags'

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
  })
  .refine((v) => (v.nature === 'transfer') === (v.categoryId === null), {
    message: 'Categoria é obrigatória para receita e despesa, e não se aplica a transferência.',
  })

const inputSchema = z
  .object({
    counterpartyId: z.string().uuid(),
    nature: z.enum(['income', 'expense', 'transfer']),
    categoryId: z.string().uuid().nullable(),
    exceptions: z.array(exceptionSchema).default([]),
  })
  .refine((v) => (v.nature === 'transfer') === (v.categoryId === null), {
    message: 'Categoria é obrigatória para receita e despesa, e não se aplica a transferência.',
  })

// `z.input`, não `z.infer`: `exceptions` tem `.default([])`, então quem chama
// pode omitir — só depois do `.parse()` é que o array garantidamente existe.
export type ConfirmCounterpartyInput = z.input<typeof inputSchema>
export type ConfirmCounterpartyException = z.infer<typeof exceptionSchema>

export async function confirmCounterparty(raw: ConfirmCounterpartyInput): Promise<{ reclassified: number }> {
  const input = inputSchema.parse(raw)
  const orgId = await getOrgId()
  const db = getDb()

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado.')

  const reclassified = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: counterparties.id })
      .from(counterparties)
      .where(and(eq(counterparties.id, input.counterpartyId), eq(counterparties.orgId, orgId)))
      .limit(1)

    if (!row) throw new Error('Contraparte não encontrada.')

    await tx
      .update(counterparties)
      .set({
        nature: input.nature,
        categoryId: input.categoryId,
        confirmedAt: new Date(),
        confirmedBy: session.user.id,
        updatedAt: new Date(),
      })
      .where(and(eq(counterparties.id, input.counterpartyId), eq(counterparties.orgId, orgId)))

    const exceptionIds = input.exceptions.map((e) => e.transactionId)

    // Chave estrangeira, não texto: todo lançamento que já apontava para
    // esta contraparte reclassifica junto, sem depender de casamento nenhum.
    // Os da lista de exceções ficam de fora daqui — recebem sua própria
    // natureza/categoria logo abaixo, sem afetar a regra gravada acima.
    const batchConditions = [
      eq(transactions.orgId, orgId),
      eq(transactions.counterpartyId, input.counterpartyId),
      eq(transactions.reviewState, 'pending'),
    ]
    if (exceptionIds.length > 0) batchConditions.push(notInArray(transactions.id, exceptionIds))

    const rows = await tx
      .update(transactions)
      .set({ type: input.nature, categoryId: input.categoryId, reviewState: 'confirmed' })
      .where(and(...batchConditions))
      .returning({ id: transactions.id })

    let reclassifiedCount = rows.length
    for (const exception of input.exceptions) {
      const exceptionRows = await tx
        .update(transactions)
        .set({ type: exception.nature, categoryId: exception.categoryId, reviewState: 'confirmed' })
        .where(
          and(
            eq(transactions.orgId, orgId),
            eq(transactions.counterpartyId, input.counterpartyId),
            eq(transactions.reviewState, 'pending'),
            eq(transactions.id, exception.transactionId),
          ),
        )
        .returning({ id: transactions.id })
      reclassifiedCount += exceptionRows.length
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

  revalidateTransactionData(orgId)
  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)

  return { reclassified }
}
