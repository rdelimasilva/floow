/**
 * Aceite de uma sugestão de categoria, dentro da transação que `withUserDb`
 * já abriu: reserva a sugestão, cria a categoria e a regra e move o histórico.
 * Só move lançamentos que estão na categoria de origem da sugestão (ou sem
 * categoria, no tipo A): o que o usuário classificou à mão em outra categoria
 * fica onde está.
 *
 * Recebe `tx: RlsTx` em vez de abrir a própria transação — quem chama é
 * `category-suggestion-actions.ts` via `withUserDb((tx) => aceitarSugestao(tx, ...))`,
 * que já roda sob RLS e já está dentro de uma transação (ver `withRls` em
 * `packages/db/src/rls.ts`).
 */
import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
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
  parentId: string | null
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

  let color: string | null = null
  let icon: string | null = null
  if (input.parentCategoryId) {
    const [mae] = await tx
      .select({ color: categories.color, icon: categories.icon, parentId: categories.parentId, type: categories.type })
      .from(categories)
      .where(
        and(
          eq(categories.id, input.parentCategoryId),
          or(eq(categories.orgId, orgId), isNull(categories.orgId)),
        ),
      )
      .limit(1)
    if (!mae) throw new Error('Categoria mãe não encontrada')
    // Só dois níveis: os seletores e /categories não mostram neta.
    if (mae.parentId !== null || mae.type !== 'expense') throw new Error('Categoria mãe inválida')
    color = mae.color
    icon = mae.icon
  }

  // Claim atômico: de dois aceites simultâneos só um acha a linha 'pending'.
  // Se algo lançar depois, o rollback da transação de withUserDb devolve a
  // sugestão para 'pending'.
  const [sug] = await tx
    .update(categorySuggestions)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(
      and(
        eq(categorySuggestions.id, input.suggestionId),
        eq(categorySuggestions.orgId, orgId),
        eq(categorySuggestions.status, 'pending'),
      ),
    )
    .returning()
  if (!sug) throw new Error('Sugestão não encontrada')

  const origem = sug.sourceCategoryIds.length > 0 ? inArray(transactions.categoryId, sug.sourceCategoryIds) : undefined
  const semCategoria = sug.kind === 'uncategorized' ? isNull(transactions.categoryId) : undefined
  // Sem nenhum dos dois o Drizzle descartaria o or(...) e moveria todo lançamento
  // do comerciante, inclusive os classificados à mão.
  if (!origem && !semCategoria) throw new Error('Sugestão sem origem')

  await assertNameIsFree(tx, orgId, name)

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
        lte(transactions.date, new Date(hoje)),
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

  return { categoryId: criada.id, name, parentId: input.parentCategoryId, monthlyAvgCents: sug.monthlyAvgCents, moved: ids.length }
}
