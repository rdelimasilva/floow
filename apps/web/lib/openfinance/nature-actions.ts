'use server'

import { z } from 'zod'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { getDb, transactions, transactionNatureRules } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { revalidateSnapshotData, revalidateTransactionData } from '@/lib/finance/revalidate'
import { accountsTag, invalidateTag } from '@/lib/cache-tags'
import { foldForMatch } from './nature-rules'

/**
 * O usuário confirma a natureza de um grupo, e a confirmação vale para trás.
 *
 * Mudar natureza NÃO toca `amount_cents` nem `balance_cents`: o sinal já está
 * correto desde a ingestão (débito é negativo) e a agregação de despesa filtra
 * por `type`. É isso que torna seguro reescrever doze meses de histórico.
 *
 * `updateTransaction` NÃO pode ser reusada aqui. Ela recalcula
 * `newSignedAmount = type === 'income' ? +v : -v` (finance/actions.ts:729). Um
 * resgate de CDB é transferência de valor POSITIVO; passar por ali o tornaria
 * negativo e o saldo quebraria em silêncio.
 */

const inputSchema = z.object({
  // Não usamos `.uuid()` aqui: o id da conta é sempre um uuid de verdade em
  // produção, mas travar o formato no schema só duplicaria uma validação que
  // a foreign key do banco já garante — e sem ganho nenhum de segurança.
  accountId: z.string().trim().min(1),
  /** Descrição normalizada do grupo. Vazio casaria com o extrato inteiro. */
  matchValue: z.string().trim().min(2),
  nature: z.enum(['income', 'expense', 'transfer']),
})

export type CreateNatureRuleInput = z.infer<typeof inputSchema>

export async function createNatureRule(
  raw: CreateNatureRuleInput,
): Promise<{ reclassified: number }> {
  const input = inputSchema.parse(raw)
  const orgId = await getOrgId()
  const db = getDb()

  const matchValue = foldForMatch(input.matchValue)
  if (matchValue.length < 2) {
    throw new Error('O texto da regra é curto demais para identificar um lançamento.')
  }

  await db.insert(transactionNatureRules).values({
    orgId,
    accountId: input.accountId,
    matchType: 'contains',
    matchValue,
    nature: input.nature,
  })

  // A comparação repete `foldForMatch` em SQL: sem acento, sem caixa, sem
  // espaço duplo. `unaccent` não está instalado no projeto, então o
  // `translate` faz o trabalho para as vogais que aparecem em português.
  const foldedDescription = sql`
    btrim(regexp_replace(
      upper(translate(${transactions.description},
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
      '\\s+', ' ', 'g'))
  `

  // `transactions` não tem coluna `updated_at` — só `created_at`, que marca a
  // ingestão original e não deve mudar aqui.
  const reclassified = await db
    .update(transactions)
    .set({ type: input.nature })
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, input.accountId),
        // As duas cercas: só dado do Open Finance, e nunca perna de
        // transferência pareada — mexer numa perna sem a outra desequilibra.
        isNotNull(transactions.externalId),
        isNull(transactions.transferGroupId),
        sql`${foldedDescription} LIKE ${'%' + matchValue + '%'}`,
      ),
    )
    .returning({ id: transactions.id })

  revalidateTransactionData(orgId)
  // `revalidateAccountData` não existe: `revalidate.ts` só exporta transação,
  // categoria e snapshot. A tag de contas é invalidada direto, como
  // `resource-actions.ts` já faz.
  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)

  return { reclassified: reclassified.length }
}
