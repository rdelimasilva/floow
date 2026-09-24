'use server'

/**
 * Server actions das sugestões de categoria (card na tela de metas).
 * A lógica mora em category-suggestions/; aqui só org, cache e revalidação.
 */
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { categorySuggestions } from '@floow/db'
import { getOrgId } from './queries'
import { withUserDb } from '@/lib/db/rls'
import { revalidateCategoryData, revalidateTransactionData } from './revalidate'
import { aceitarSugestao, type AcceptInput, type AcceptResult } from './category-suggestions/accept'
import { runCategorySuggestionsForOrg } from './category-suggestions/job'
import { defaultCategorySuggestionDeps } from './category-suggestions/deps'
import { hojeSP } from './category-suggestions/janela'

export async function acceptCategorySuggestion(input: AcceptInput): Promise<AcceptResult> {
  const orgId = await getOrgId()
  const result = await withUserDb((tx) => aceitarSugestao(tx, orgId, input, hojeSP()))
  revalidateCategoryData(orgId)
  revalidateTransactionData(orgId)
  revalidatePath('/budgets/spending')
  return result
}

export async function dismissCategorySuggestion(id: string): Promise<void> {
  const orgId = await getOrgId()
  await withUserDb((tx) =>
    tx
      .update(categorySuggestions)
      .set({ status: 'dismissed', updatedAt: new Date() })
      .where(and(eq(categorySuggestions.id, id), eq(categorySuggestions.orgId, orgId), eq(categorySuggestions.status, 'pending'))),
  )
  revalidatePath('/budgets/spending')
}

export async function analyzeCategorySuggestions(): Promise<{ pending: number }> {
  const orgId = await getOrgId()
  const r = await runCategorySuggestionsForOrg(orgId, defaultCategorySuggestionDeps())
  revalidatePath('/budgets/spending')
  return r
}
