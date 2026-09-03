'use server'

import { z } from 'zod'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { getDb, transactions, transactionNatureRules } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { assertAccountOwnership } from '@/lib/finance/actions'
import { revalidateSnapshotData, revalidateTransactionData } from '@/lib/finance/revalidate'
import { accountsTag, invalidateTag } from '@/lib/cache-tags'
import { escapeLikePattern } from '@/lib/finance/sql-utils'
import { foldForRuleMatch } from './nature-rules'

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
  accountId: z.string().uuid(),
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

  // A regra grava `matchType: 'contains'` sempre, e a comparação `contains`
  // ignora dígito (ver `foldForRuleMatch` em `nature-rules.ts`) — é o mesmo
  // tratamento que `groupKey` já deu à chave que a tela manda como
  // `matchValue`. Dobrar com `foldForMatch` aqui e deixar o dígito reapareceria
  // no valor gravado, e o `LIKE` do backfill abaixo — que compara contra uma
  // descrição já sem dígito — nunca acharia essas linhas.
  const matchValue = foldForRuleMatch(input.matchValue)
  if (matchValue.length < 2) {
    throw new Error('O texto da regra é curto demais para identificar um lançamento.')
  }

  // A comparação repete a mesma dobra em SQL: sem acento, sem caixa, sem
  // dígito, sem espaço duplo. `unaccent` não está instalado no projeto, então
  // o `translate` faz o trabalho para as vogais que aparecem em português.
  const foldedDescription = sql`
    btrim(regexp_replace(
      regexp_replace(
        upper(translate(${transactions.description},
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
        '[0-9][0-9./-]*', ' ', 'g'),
      '\\s+', ' ', 'g'))
  `

  // `%` e `_` são curinga de LIKE, e aparecem em descrição bancária real
  // ("IOF 6,38%", "RENDIMENTO 100% CDI"). Sem escapar, a regra do usuário
  // reclassificaria muito mais linha do que ele confirmou.
  const likePattern = `%${escapeLikePattern(matchValue)}%`

  // INSERT da regra e UPDATE retroativo andam juntos: se o UPDATE falhar
  // depois da regra já gravada, o grupo some da tela de suspeitas (a exclusão
  // em `nature-queries.ts` passa a casar) e as transações continuam como
  // `expense` — o pior desfecho, porque é silencioso. `db.transaction`
  // desfaz os dois se qualquer um falhar.
  const reclassified = await db.transaction(async (tx) => {
    // A FK só garante que a conta existe, não que é desta org — sem esta
    // checagem, o sucesso do insert vira oráculo de existência de UUID de
    // conta de outra org, e a regra fica apontando para fora da org do
    // usuário.
    // Cast necessário: o tipo da transação do Drizzle não é estruturalmente
    // idêntico ao de `getDb()` (falta `$client`), mesma solução já usada em
    // `finance/actions.ts` para o mesmo helper dentro de `db.transaction`.
    await assertAccountOwnership(
      tx as unknown as Parameters<typeof assertAccountOwnership>[0],
      input.accountId,
      orgId,
    )

    await tx.insert(transactionNatureRules).values({
      orgId,
      accountId: input.accountId,
      matchType: 'contains',
      matchValue,
      nature: input.nature,
    })

    // `transactions` não tem coluna `updated_at` — só `created_at`, que marca
    // a ingestão original e não deve mudar aqui.
    return tx
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
          sql`${foldedDescription} LIKE ${likePattern}`,
        ),
      )
      .returning({ id: transactions.id })
  })

  revalidateTransactionData(orgId)
  // `revalidateAccountData` não existe: `revalidate.ts` só exporta transação,
  // categoria e snapshot. A tag de contas é invalidada direto, como
  // `resource-actions.ts` já faz.
  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)

  return { reclassified: reclassified.length }
}
