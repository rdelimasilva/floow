'use server'

import { z } from 'zod'
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { getDb, transactions, transactionNatureRules } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { assertAccountOwnership } from '@/lib/finance/actions'
import { revalidateSnapshotData, revalidateTransactionData } from '@/lib/finance/revalidate'
import { accountsTag, invalidateTag } from '@/lib/cache-tags'
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
 *
 * PASSADO e FUTURO são reescritos por caminhos diferentes, de propósito:
 * `transactionIds` diz exatamente quais linhas já gravadas mudam de natureza; a
 * regra em `transaction_nature_rules` governa o que ainda vai chegar, aplicada
 * na ingestão por `applyNatureRules`.
 */

const inputSchema = z.object({
  accountId: z.string().uuid(),
  /** Descrição normalizada do grupo. Vazio casaria com o extrato inteiro. */
  matchValue: z.string().trim().min(2),
  /**
   * Exatamente os lançamentos que mudam de natureza agora.
   *
   * Vêm do detector, que é quem contou os "12 lançamentos" que o usuário leu na
   * tela. Substituem o `LIKE` sobre descrição dobrada que existia aqui: aquela
   * dobra era uma SEGUNDA implementação da normalização, em SQL, e divergia da
   * de JS em toda descrição acentuada em forma decomposta — o `UPDATE` casava
   * zero linhas, zero não é erro, e o grupo sumia do painel com o dinheiro
   * ainda contado como despesa.
   *
   * Os ids vêm do cliente e não são confiáveis por si: quem protege são as
   * cercas do `UPDATE` (org, conta, origem Open Finance, perna não pareada).
   */
  transactionIds: z.array(z.string().uuid()).min(1),
  /**
   * `income` NÃO entra aqui.
   *
   * O único ponto de entrada desta ação é uma linha de despesa, e toda despesa
   * tem `amount_cents` negativo (ver `normalize.ts`). Gravar `income` mantendo o
   * valor negativo faria a receita do mês DESPENCAR no dashboard, no fluxo de
   * caixa e no pacing. O estado inválido fica irrepresentável no tipo, em vez de
   * ser vigiado em runtime.
   */
  nature: z.enum(['expense', 'transfer']),
})

export type CreateNatureRuleInput = z.infer<typeof inputSchema>

export async function createNatureRule(
  raw: CreateNatureRuleInput,
): Promise<{ reclassified: number }> {
  const input = inputSchema.parse(raw)
  const orgId = await getOrgId()
  const db = getDb()

  // A regra grava `matchType: 'contains'`, e a comparação `contains` ignora
  // dígito (ver `foldForRuleMatch` em `nature-rules.ts`) — é o mesmo tratamento
  // que `groupKey` já deu à chave que a tela manda como `matchValue`. Os dois
  // lados da comparação futura passam por esta mesma função, em JS: não há mais
  // nenhuma dobra em SQL para divergir dela.
  const matchValue = foldForRuleMatch(input.matchValue)
  if (matchValue.length < 2) {
    throw new Error('O texto da regra é curto demais para identificar um lançamento.')
  }

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

    // `onConflictDoNothing`: confirmar o mesmo grupo duas vezes gravaria duas
    // regras idênticas que a interface não sabe remover. Os índices únicos
    // parciais da migration 00034 cobrem os dois escopos — regra de conta e
    // regra da org inteira, que `NULL <> NULL` deixaria escapar num índice só.
    await tx
      .insert(transactionNatureRules)
      .values({
        orgId,
        accountId: input.accountId,
        matchType: 'contains',
        matchValue,
        nature: input.nature,
      })
      .onConflictDoNothing()

    // `transactions` não tem coluna `updated_at` — só `created_at`, que marca
    // a ingestão original e não deve mudar aqui.
    const rows = await tx
      .update(transactions)
      .set({ type: input.nature })
      .where(
        and(
          eq(transactions.orgId, orgId),
          eq(transactions.accountId, input.accountId),
          // As cercas continuam sendo a rede, agora sobre ids vindos do
          // cliente: só dado do Open Finance, e nunca perna de transferência
          // pareada — mexer numa perna sem a outra desequilibra o par.
          isNotNull(transactions.externalId),
          isNull(transactions.transferGroupId),
          inArray(transactions.id, input.transactionIds),
        ),
      )
      .returning({ id: transactions.id })

    // Zero linhas aqui significa que algo está errado: os ids saíram do próprio
    // detector, que já aplicou estas mesmas cercas. Deixar passar em silêncio
    // gravaria a regra, silenciaria o grupo no painel e manteria o dinheiro
    // contado como despesa — exatamente o desfecho que a transação existe para
    // impedir.
    if (rows.length === 0) {
      throw new Error(
        'Nenhum lançamento correspondeu; a regra não foi criada. Recarregue a página e tente de novo.',
      )
    }

    return rows
  })

  revalidateTransactionData(orgId)
  // `revalidateAccountData` não existe: `revalidate.ts` só exporta transação,
  // categoria e snapshot. A tag de contas é invalidada direto, como
  // `resource-actions.ts` já faz.
  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)

  return { reclassified: reclassified.length }
}
