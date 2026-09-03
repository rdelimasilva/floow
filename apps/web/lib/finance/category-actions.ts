'use server'

/**
 * Server actions de categoria.
 *
 * Vive fora de actions.ts, que já passa de 1500 linhas, pelo mesmo motivo de
 * recurring-actions.ts: o limite de 500 linhas do CLAUDE.md.
 *
 * A regra que governa este arquivo: **categoria de sistema é de todas as orgs**.
 * Ela tem `org_id IS NULL` e aparece para todo mundo, então um UPDATE ou DELETE
 * por id afeta todos os clientes do floow. A interface permitia isso, e o
 * estrago é real — neste banco "Transporte" virou "Carro" e "Saúde", "Outros" e
 * "Assinaturas" sumiram para as três orgs de uma vez.
 *
 * Daqui em diante, mexer numa categoria de sistema faz copy-on-write: a org
 * ganha uma cópia sua, com o histórico dela junto, e a original fica intacta
 * para as demais.
 */

import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import {
  getDb,
  categories,
  categoryRules,
  budgetEntries,
  debts,
  hiddenSystemCategories,
  recurringTemplates,
  transactions,
} from '@floow/db'
import { getOrgId } from './queries'
import { revalidateCategoryData, revalidateTransactionData } from './revalidate'

type Db = ReturnType<typeof getDb>

const VALID_TYPES = ['income', 'expense', 'transfer'] as const
type CategoryType = (typeof VALID_TYPES)[number]

export async function createCategory(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const color = formData.get('color') as string | null
  const icon = formData.get('icon') as string | null

  if (!name || !type) throw new Error('Name and type are required')
  if (!(VALID_TYPES as readonly string[]).includes(type)) throw new Error('Invalid category type')

  await assertNameIsFree(db, orgId, name)

  const [category] = await db
    .insert(categories)
    .values({
      orgId,
      name,
      type: type as CategoryType,
      color: color || null,
      icon: icon || null,
    })
    .returning()

  revalidateCategoryData(orgId)
  revalidateTransactionData(orgId)

  return category
}

/**
 * Edita uma categoria da org; numa de sistema, cria a versão da org.
 *
 * O copy-on-write não é só sobre não estragar o vizinho: a cópia leva junto as
 * transações, tetos e regras que ESTA org tinha naquela categoria. Sem isso o
 * usuário renomearia "Transporte" para "Carro" e veria o histórico continuar
 * em "Transporte", como se tivesse criado uma categoria vazia.
 */
export async function updateCategory(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const color = formData.get('color') as string | null
  const icon = formData.get('icon') as string | null

  if (!id || !name || !type) throw new Error('ID, name, and type are required')
  if (!(VALID_TYPES as readonly string[]).includes(type)) throw new Error('Invalid category type')

  const existing = await findVisibleCategory(db, orgId, id)
  if (!existing) throw new Error('Categoria não encontrada')

  await assertNameIsFree(db, orgId, name, id)

  const updated =
    existing.orgId === null
      ? await forkSystemCategory(db, orgId, existing, {
          name,
          type: type as CategoryType,
          color: color || null,
          icon: icon || null,
        })
      : await applyUpdate(db, id, {
          name,
          type: type as CategoryType,
          color: color || null,
          icon: icon || null,
        })

  revalidateCategoryData(orgId)
  revalidateTransactionData(orgId)

  return updated
}

/**
 * Exclui uma categoria da org; numa de sistema, esconde só para esta org.
 *
 * Apagar a linha de sistema tiraria a categoria de todas as outras orgs — é
 * literalmente o defeito que este arquivo conserta.
 */
export async function deleteCategory(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  if (!id) throw new Error('Category ID is required')

  const existing = await findVisibleCategory(db, orgId, id)
  if (!existing) throw new Error('Categoria não encontrada')

  if (existing.orgId === null) {
    await clearOrgReferences(db, orgId, id)
    await hideForOrg(db, orgId, id)
  } else {
    // A FK das referências é ON DELETE SET NULL: as transações ficam sem
    // categoria, como antes.
    await db.delete(categories).where(eq(categories.id, id))
  }

  revalidateCategoryData(orgId)
  revalidateTransactionData(orgId)
}

/** Reaponta tudo desta org para outra categoria e some com a antiga. */
export async function reassignAndDeleteCategory(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const oldId = formData.get('oldId') as string
  const newId = formData.get('newId') as string
  if (!oldId) throw new Error('oldId is required')
  if (!newId) throw new Error('newId is required')
  if (oldId === newId) throw new Error('A categoria de destino deve ser diferente')

  const oldCat = await findVisibleCategory(db, orgId, oldId)
  if (!oldCat) throw new Error('Categoria não encontrada')

  const newCat = await findVisibleCategory(db, orgId, newId)
  if (!newCat) throw new Error('Categoria de destino não encontrada')
  if (newCat.type !== oldCat.type) throw new Error('A categoria de destino deve ser do mesmo tipo')

  await moveOrgReferences(db, orgId, oldId, newId)

  if (oldCat.orgId === null) {
    await hideForOrg(db, orgId, oldId)
  } else {
    await db.delete(categories).where(eq(categories.id, oldId))
  }

  revalidateCategoryData(orgId)
  revalidateTransactionData(orgId)
}

/**
 * Quantos itens desta org apontam para a categoria.
 *
 * Conta só o que é da org: numa categoria de sistema, o uso das outras orgs não
 * é da conta desta, e mostrá-lo assustaria sem motivo.
 */
export async function getCategoryUsage(categoryId: string) {
  const orgId = await getOrgId()
  const db = getDb()

  const cat = await findVisibleCategory(db, orgId, categoryId)
  if (!cat) throw new Error('Categoria não encontrada')

  const rows = (await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM transactions WHERE org_id = ${orgId} AND category_id = ${categoryId}) AS transactions,
      (SELECT count(*)::int FROM recurring_templates WHERE org_id = ${orgId} AND category_id = ${categoryId}) AS recurring,
      (SELECT count(*)::int FROM budget_entries WHERE org_id = ${orgId} AND category_id = ${categoryId}) AS budgets,
      (SELECT count(*)::int FROM debts WHERE org_id = ${orgId} AND category_id = ${categoryId}) AS debts,
      (SELECT count(*)::int FROM category_rules WHERE org_id = ${orgId} AND category_id = ${categoryId}) AS rules
  `)) as unknown as Array<{
    transactions: number
    recurring: number
    budgets: number
    debts: number
    rules: number
  }>

  return rows[0] ?? { transactions: 0, recurring: 0, budgets: 0, debts: 0, rules: 0 }
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

/** Categoria da org ou de sistema — as duas são visíveis para ela. */
async function findVisibleCategory(db: Db, orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), or(eq(categories.orgId, orgId), isNull(categories.orgId))))
    .limit(1)

  return row ?? null
}

async function assertNameIsFree(db: Db, orgId: string, name: string, exceptId?: string) {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(ilike(categories.name, name), or(eq(categories.orgId, orgId), isNull(categories.orgId))))

  if (rows.some((row) => row.id !== exceptId)) {
    throw new Error('Já existe uma categoria com esse nome')
  }
}

async function applyUpdate(
  db: Db,
  id: string,
  values: { name: string; type: CategoryType; color: string | null; icon: string | null },
) {
  const [updated] = await db.update(categories).set(values).where(eq(categories.id, id)).returning()
  return updated
}

/**
 * Cria a versão da org a partir de uma categoria de sistema.
 *
 * `polpRef` vem junto para a ingestão continuar sabendo onde pôr o que a Polp
 * mandar com aquele `category_ref` — o índice único de `polp_ref` só vale para
 * `org_id IS NULL`, então a cópia não colide. `parentId` também vem junto: a
 * cópia continua pendurada na mesma raiz, e o rollup de orçamento segue
 * funcionando.
 */
async function forkSystemCategory(
  db: Db,
  orgId: string,
  system: typeof categories.$inferSelect,
  values: { name: string; type: CategoryType; color: string | null; icon: string | null },
) {
  const [copy] = await db
    .insert(categories)
    .values({
      orgId,
      name: values.name,
      type: values.type,
      color: values.color,
      icon: values.icon,
      isSystem: false,
      parentId: system.parentId,
      polpRef: system.polpRef,
    })
    .returning()

  await moveOrgReferences(db, orgId, system.id, copy.id)
  // Sem esconder a original, a org veria as duas: a que ela renomeou e a de
  // sistema com o nome antigo.
  await hideForOrg(db, orgId, system.id)

  return copy
}

async function hideForOrg(db: Db, orgId: string, categoryId: string) {
  await db.insert(hiddenSystemCategories).values({ orgId, categoryId }).onConflictDoNothing()
}

/** Move todas as referências DESTA org de uma categoria para outra. */
async function moveOrgReferences(db: Db, orgId: string, fromId: string, toId: string) {
  await Promise.all([
    db
      .update(transactions)
      .set({ categoryId: toId })
      .where(and(eq(transactions.orgId, orgId), eq(transactions.categoryId, fromId))),
    db
      .update(recurringTemplates)
      .set({ categoryId: toId })
      .where(and(eq(recurringTemplates.orgId, orgId), eq(recurringTemplates.categoryId, fromId))),
    db
      .update(budgetEntries)
      .set({ categoryId: toId })
      .where(and(eq(budgetEntries.orgId, orgId), eq(budgetEntries.categoryId, fromId))),
    db
      .update(debts)
      .set({ categoryId: toId })
      .where(and(eq(debts.orgId, orgId), eq(debts.categoryId, fromId))),
    db
      .update(categoryRules)
      .set({ categoryId: toId })
      .where(and(eq(categoryRules.orgId, orgId), eq(categoryRules.categoryId, fromId))),
  ])
}

/**
 * Solta as referências desta org, sem tocar nas das outras.
 *
 * `debts.category_id` é NOT NULL com ON DELETE CASCADE: não dá para soltar, e
 * deixar cair em cascata apagaria a dívida do usuário junto com a categoria.
 * Então a exclusão para aí e pede reatribuição — que é o caminho que a interface
 * já oferece quando há referências.
 */
async function clearOrgReferences(db: Db, orgId: string, categoryId: string) {
  const [emUso] = await db
    .select({ id: debts.id })
    .from(debts)
    .where(and(eq(debts.orgId, orgId), eq(debts.categoryId, categoryId)))
    .limit(1)

  if (emUso) {
    throw new Error('Há dívidas usando esta categoria. Escolha uma categoria de destino para elas.')
  }

  await Promise.all([
    db
      .update(transactions)
      .set({ categoryId: null })
      .where(and(eq(transactions.orgId, orgId), eq(transactions.categoryId, categoryId))),
    db
      .update(recurringTemplates)
      .set({ categoryId: null })
      .where(and(eq(recurringTemplates.orgId, orgId), eq(recurringTemplates.categoryId, categoryId))),
    db
      .delete(budgetEntries)
      .where(and(eq(budgetEntries.orgId, orgId), eq(budgetEntries.categoryId, categoryId))),
    db
      .delete(categoryRules)
      .where(and(eq(categoryRules.orgId, orgId), eq(categoryRules.categoryId, categoryId))),
  ])
}
