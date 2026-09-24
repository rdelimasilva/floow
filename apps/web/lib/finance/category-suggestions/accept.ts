/**
 * Aceite de uma sugestão de categoria, dentro da transação que `withUserDb`
 * já abriu: cria a categoria, a regra, move o histórico e marca a sugestão.
 * Só move lançamentos que estão na categoria de origem da sugestão (ou sem
 * categoria, no tipo A): o que o usuário classificou à mão em outra categoria
 * fica onde está.
 *
 * Recebe `tx: RlsTx` em vez de abrir a própria transação — quem chama é
 * `category-suggestion-actions.ts` via `withUserDb((tx) => aceitarSugestao(tx, ...))`,
 * que já roda sob RLS e já está dentro de uma transação (ver `withRls` em
 * `packages/db/src/rls.ts`).
 */
import { and, eq, gte, inArray, isNull, or } from 'drizzle-orm'
import { categories, categoryRules, categorySuggestions, transactions, type RlsTx } from '@floow/db'
import { normalizeMerchant } from '@floow/core-finance'
import { assertNameIsFree } from '../category-name'
import { inicioDaJanela } from './janela'

export interface AcceptInput {
  suggestionId: string
  name: string
  parentCategoryId: string | null
}

export interface AcceptResult {
  categoryId: string
  name: string
  monthlyAvgCents: number
  moved: number
}

export async function aceitarSugestao(
  tx: RlsTx,
  orgId: string,
  input: AcceptInput,
  hoje: string,
): Promise<AcceptResult> {
  const name = input.name.trim()
  if (!name) throw new Error('Informe um nome')

  const [sug] = await tx
    .select()
    .from(categorySuggestions)
    .where(
      and(
        eq(categorySuggestions.id, input.suggestionId),
        eq(categorySuggestions.orgId, orgId),
        eq(categorySuggestions.status, 'pending'),
      ),
    )
    .limit(1)
  if (!sug) throw new Error('Sugestão não encontrada')

  await assertNameIsFree(tx, orgId, name)

  let color: string | null = null
  let icon: string | null = null
  if (input.parentCategoryId) {
    const [mae] = await tx
      .select({ color: categories.color, icon: categories.icon })
      .from(categories)
      .where(
        and(
          eq(categories.id, input.parentCategoryId),
          or(eq(categories.orgId, orgId), isNull(categories.orgId)),
        ),
      )
      .limit(1)
    if (!mae) throw new Error('Categoria mãe não encontrada')
    color = mae.color
    icon = mae.icon
  }

  const [criada] = await tx
    .insert(categories)
    .values({ orgId, name, type: 'expense', color, icon, parentId: input.parentCategoryId })
    .returning({ id: categories.id })

  if (sug.matchValue) {
    await tx.insert(categoryRules).values({
      orgId,
      categoryId: criada.id,
      matchType: 'contains',
      matchValue: sug.matchValue,
    })
  }

  const origem = sug.sourceCategoryIds.length > 0 ? inArray(transactions.categoryId, sug.sourceCategoryIds) : undefined
  const semCategoria = sug.kind === 'uncategorized' ? isNull(transactions.categoryId) : undefined
  // Coluna é `date` (mode 'date', mesmo tratamento de budget-pacing-actions.ts):
  // compara com Date, não com a string 'YYYY-MM-DD' que `inicioDaJanela` devolve.
  const candidatos = await tx
    .select({ id: transactions.id, description: transactions.description })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.type, 'expense'),
        gte(transactions.date, new Date(inicioDaJanela(hoje))),
        or(origem, semCategoria),
      ),
    )

  const ids = candidatos.filter((c) => normalizeMerchant(c.description) === sug.merchantKey).map((c) => c.id)
  if (ids.length > 0) {
    await tx
      .update(transactions)
      .set({ categoryId: criada.id })
      .where(and(eq(transactions.orgId, orgId), inArray(transactions.id, ids)))
  }

  await tx
    .update(categorySuggestions)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(eq(categorySuggestions.id, sug.id))

  return { categoryId: criada.id, name, monthlyAvgCents: sug.monthlyAvgCents, moved: ids.length }
}
